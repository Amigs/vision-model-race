"""Local CLEF decision API. No downstream actions are executed."""
import os
os.environ.setdefault('VLLM_ENABLE_V1_MULTIPROCESSING','0')
os.environ.setdefault('HF_HUB_OFFLINE','1')
os.environ.setdefault('VLLM_NO_USAGE_STATS','1')
import json,sys,time,logging,base64,io,signal,faulthandler
faulthandler.register(signal.SIGUSR1)
signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
from pathlib import Path
from http.server import BaseHTTPRequestHandler,HTTPServer
from huggingface_hub import snapshot_download
REPO=os.environ['CLEF_REPO']
REVISION=os.environ['CLEF_REVISION']
MODEL_PATH=snapshot_download(REPO,revision=REVISION,cache_dir='/hf/hub',local_files_only=True)
MAX_LENGTH=int(os.getenv('CLEF_MAX_LENGTH','4096'))
sys.path.insert(0,MODEL_PATH)
from clef_vllm import ClefVLLM
from joint_schema_model import encode_record
engine=ClefVLLM(MODEL_PATH,max_model_len=MAX_LENGTH,gpu_memory_utilization=float(os.getenv('CLEF_GPU_MEMORY','0.4')),max_images=1,max_videos=0,max_num_seqs=4,kv_cache_memory_bytes=4*1024**3)
example=json.loads(Path('/app/example.json').read_text())
engine.systemone(example,max_length=MAX_LENGTH)
print('CLEF_READY',flush=True)
class Handler(BaseHTTPRequestHandler):
 def reply(self,status,value):
  data=json.dumps(value,ensure_ascii=False,allow_nan=False).encode()
  self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
 def do_GET(self):
  if self.path=='/health':self.reply(200,{'status':'ok','model':REPO,'revision':REVISION,'max_input_tokens':MAX_LENGTH})
  elif self.path=='/example':self.reply(200,example)
  else:self.reply(404,{'error':'Use POST /v1/systemone, GET /health or GET /example'})
 def do_POST(self):
  if self.path!='/v1/systemone':self.reply(404,{'error':'Unknown route'});return
  try:
   length=int(self.headers.get('Content-Length','0'))
   if length<1 or length>4*1024*1024:raise ValueError('JSON body must be between 1 byte and 4 MiB')
   req=json.loads(self.rfile.read(length))
   if not isinstance(req,dict):raise ValueError('JSON object required')
   if req.get('model') not in ('clef',REPO):raise ValueError('model must be clef or '+REPO)
   if 'state' not in req:raise ValueError('state is required')
   qs=req.get('questions')
   if not isinstance(qs,dict) or not 1<=len(qs)<=32:raise ValueError('Provide 1 to 32 questions')
   for key,q in qs.items():
    if not isinstance(q,dict) or q.get('type') not in ('choice','score','noul'):raise ValueError('Invalid question type: '+key)
    c=q.get('criteria')
    if q['type']=='choice' and (not isinstance(c,dict) or not 1<=len(c)<=128 or not all(isinstance(v,str) for v in c.values())):raise ValueError('choice requires 1 to 128 named text criteria')
    if q['type']=='score' and (not isinstance(c,list) or not 1<=len(c)<=128 or not all(isinstance(v,str) for v in c)):raise ValueError('score requires a list of text criteria')
    if q['type']=='noul' and c is not None and (not isinstance(c,dict) or set(c)-{'true','false'} or not all(isinstance(v,str) for v in c.values())):raise ValueError('noul criteria must describe true and/or false')
   if req.get('images') or req.get('videos'):raise ValueError('Use images_base64 for one image; video is not exposed by this API')
   images=req.pop('images_base64',[])
   if not isinstance(images,list) or len(images)>1:raise ValueError('At most one base64 image is accepted')
   if images:
    from PIL import Image,UnidentifiedImageError
    if not isinstance(images[0],str):raise ValueError('Image must be a base64 string')
    try:
     raw=base64.b64decode(images[0],validate=True)
     if len(raw)>3*1024*1024:raise ValueError('Image exceeds 3 MiB')
     img=Image.open(io.BytesIO(raw))
     if img.width*img.height>16000000:raise ValueError('Image exceeds 16 million pixels')
     img.load();img=img.convert('RGB');img.thumbnail((640,640))
    except (OSError,UnidentifiedImageError) as exc:raise ValueError('Invalid image') from exc
    req['images']=[img]
   encoded=encode_record(engine.tokenizer,req,max_length=1000000,processor=engine.processor)
   if len(encoded.input_ids)>MAX_LENGTH:raise ValueError(f"Input exceeds {MAX_LENGTH} tokens; shorten state or questions")
   start=time.perf_counter()
   faulthandler.dump_traceback_later(30)
   try:response=engine.systemone(req,max_length=MAX_LENGTH)
   finally:faulthandler.cancel_dump_traceback_later()
   response['served_model']=REPO
   response['latency_ms']=round((time.perf_counter()-start)*1000,2)
   self.reply(200,response)
  except (ValueError,TypeError,KeyError) as e:self.reply(400,{'error':str(e)})
  except Exception:
   logging.exception('Inference failed');self.reply(500,{'error':'Inference failed; inspect container logs'})
HTTPServer(('0.0.0.0',8080),Handler).serve_forever()
