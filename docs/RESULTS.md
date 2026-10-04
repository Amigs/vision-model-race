# Recorded runs

All three runs use track **17**, speed **6 m/s**, a **640×360** front camera and a **120 m** finish line. Course version: 3. Prompt version: 5. Added delay: 0 ms. Recorded on October 4, 2026 (UTC).

Each model was warmed up before its run. The recordings below are the first completed runs after warm-up with these settings.

| Model                         | Distance | Median latency | Applied decisions | Responses after finish/impact | Errors |
| ----------------------------- | -------: | -------------: | ----------------: | ----------------------------: | -----: |
| Qwen3-VL-30B-A3B-Instruct-FP8 |  31.10 m |         533 ms |                 8 |                             0 |      0 |
| gpt-4.1-mini-2025-04-14       |  45.07 m |       2,127 ms |                 3 |                             1 |      0 |
| simonlehmann/clef-NVFP4       | 120.00 m |       422.5 ms |                36 |                             1 |      0 |

## What happened

- **Qwen** kept issuing RIGHT before hitting the obstacle in the right lane at 31.1 m. There was no request pending at impact.
- **GPT** kept issuing LEFT and hit the obstacle in the left lane at 45.1 m. A pending request returned LEFT after the collision.
- **CLEF** changed between LEFT and RIGHT and reached the finish line.

## Setup

The runs were executed separately. Qwen and CLEF shared a DGX Spark; GPT used the OpenAI API.

| Model                         | Serving setup                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------- |
| Qwen3-VL-30B-A3B-Instruct-FP8 | MoE, NVIDIA vLLM image `nvcr.io/nvidia/vllm:26.03-py3`                          |
| GPT-4.1 mini                  | Snapshot `gpt-4.1-mini-2025-04-14`                                              |
| CLEF NVFP4                    | `vllm/vllm-openai:v0.23.0`, revision `817ac58ad358f42489980ead62f8bf7cafc628c2` |

## Timing

Latency starts when the browser captures the input and ends when it processes the response. It includes capture, the app server, network transport and inference. The reported median uses decisions applied during the run. Warm-up requests and responses received after the run ends are excluded from that median.

There is at most one pending request, with a 100 ms gap before the next one. The robot moves during requests. Its physics uses steps of up to 1/120 s, and a lane change takes 0.30 seconds.

## Data and replay

[`runs.json`](../public/comparison/runs.json) contains the input images, responses, probabilities where available, reported usage, positions and event timestamps. [`manifest.json`](../public/comparison/manifest.json) records the settings and the data file's SHA-256 hash.

Prompts and request formats are in `server.mjs`; track generation and collisions are in `public/physics.mjs`.

The videos render the recorded trajectories with interpolation between position samples. Each camera inset shows the image from the most recent request.

- **Side by side:** 3840×2160 at 30 fps, with a 2-second lead-in and a 5-second final hold.
- **Vertical:** 1080×1920 at 30 fps, ordered Qwen → GPT → CLEF, with a 1.5-second lead-in and a 2.5-second final hold per model.

Race timing is preserved in both edits. Replay and export do not send new inference requests.
