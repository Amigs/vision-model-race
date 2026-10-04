# Vision Model Race

A small 3D obstacle course for testing vision and decision models. A robot moves through three lanes toward a finish line 120 metres away. The model chooses **left** or **right** while the robot keeps moving.

Built with Three.js and Node.js. Connect a local model server or a hosted API.

[![Watch Qwen, GPT and CLEF on the same course](docs/comparison.jpg)](docs/comparison.mp4)

## Quick start

You need Node.js 22+, pnpm 10 and a browser with WebGL.

```bash
pnpm install --frozen-lockfile
pnpm start
```

Open [localhost:4180](http://127.0.0.1:4180). Choose **Reglas** for the built-in controller or **Tú** to steer with the arrow keys. Neither needs a model server.

## Connect a model

Open the settings menu (⚙) and enter your endpoint, model name and API key. You can also copy `.connections.example.json` to `.connections.json` and fill in the same values there.

| Model        | Input            | Connection                                                       |
| ------------ | ---------------- | ---------------------------------------------------------------- |
| Qwen         | Camera or LiDAR  | Chat Completions server with image input and JSON Schema support |
| GPT-4.1 mini | Camera or LiDAR  | OpenAI API                                                       |
| CLEF         | Camera or LiDAR  | SystemOne endpoint; adapter included in `adapters/clef/`         |
| Jev          | LiDAR/text       | TypeSafe API                                                     |
| Other LLM    | Depends on model | Chat Completions endpoint                                        |

See [connection setup](docs/CONNECTIONS.md) for the model-specific steps. Start your inference server before running the app.

For environment variables, copy `.env.example` to `.env` and run `pnpm run start:env`.

## Run a race

1. Select a model and camera or LiDAR input.
2. Choose a track and speed. The included runs use **track 17 at 6 m/s**.
3. Click **Preparar modelo** to warm up the model with a stationary frame.
4. Click **Iniciar carrera** to start.
5. After the run, use **↓ Datos** to download the recording. A copy is also saved in `runs/`.

Each action moves one lane. An outward action at the edge keeps the robot in that lane. Between responses, it continues toward its last chosen lane. A lane change takes 0.30 seconds.

Keep the tab visible during a race. Switching away ends the run because browsers throttle background tabs.

### Model input

- **Camera:** a 640×360 JPEG from the robot's front camera, its speed and the previous response latency.
- **LiDAR:** three forward distances, one per lane, plus speed, target lane, lane-change state and previous latency. The sensor is a planar corridor scan with a 26-metre range.

Qwen and GPT return `{"action":"LEFT"}` or `{"action":"RIGHT"}` through JSON Schema. CLEF returns a native choice. Requests run one at a time, with a 100 ms gap after each response.

## Included runs

| Model                         | Distance | Median response time |
| ----------------------------- | -------: | -------------------: |
| Qwen3-VL-30B-A3B-Instruct-FP8 |  31.10 m |               533 ms |
| GPT-4.1 mini                  |  45.07 m |             2,127 ms |
| CLEF NVFP4                    | 120.00 m |             422.5 ms |

Qwen and CLEF ran on a DGX Spark; GPT used the OpenAI API. Response time is measured from capture to receipt in the browser. See [run details](docs/RESULTS.md) for model versions, timing and the recorded data.

## Replay and export

- [Side by side](http://127.0.0.1:4180/compare.html): all three runs, 3840×2160.
- [Vertical](http://127.0.0.1:4180/mobile.html): Qwen, GPT, then CLEF, 1080×1920.

Both views show the image sent to the model. They replay saved positions and decisions, so viewing or exporting them makes no API calls.

To export an MP4 at 30 fps, install FFmpeg and make it available on `PATH`, or set `FFMPEG_PATH` to its executable. Then use the export button on either replay page.

## Development

```bash
pnpm test
pnpm run check:public
```

The track and collision logic live in `public/physics.mjs`. Model connectors are in `server.mjs`, and the CLEF server adapter is in `adapters/clef/`.

[MIT license](LICENSE). Model licenses are linked in the [connection guide](docs/CONNECTIONS.md).
