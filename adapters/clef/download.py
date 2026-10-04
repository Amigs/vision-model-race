"""Download the pinned public model into /hf/hub; never called by the web app."""
from huggingface_hub import snapshot_download
snapshot_download(
    repo_id="simonlehmann/clef-NVFP4",
    revision="817ac58ad358f42489980ead62f8bf7cafc628c2",
    cache_dir="/hf/hub",
)
