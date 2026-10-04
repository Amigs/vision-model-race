# Model connections

Set up your inference endpoints first, then enter their URLs in the app's settings menu (⚙). Endpoints can run on the same computer or on another machine reachable from the app server.

Settings are saved in `.connections.json`. Blank fields keep their previous values. `.connections.example.json` lists the available fields; `.env.example` provides the environment-variable equivalents.

## OpenAI

1. Create an API key in your [OpenAI project](https://platform.openai.com/api-keys).
2. Enter it in the OpenAI section of settings and save.
3. Click **Comprobar OpenAI** to check model access.
4. Select GPT and camera input, warm up the model, then start the race.

The included run uses `gpt-4.1-mini-2025-04-14`. The connector sends Chat Completions requests with strict JSON Schema, temperature 0 and a 32-token output limit. You can change `openaiModel` in your settings file. Check the model's parameter support when using a different model.

The access check reads the model endpoint. Warm-up and race requests run inference and use API credits.

## Qwen

Use a server that supports:

- `GET /v1/models`
- `POST /v1/chat/completions`
- Images as `image_url` data URLs
- `response_format` with JSON Schema

In settings, expand **Otro LLM o servidores locales**. Enter the Qwen base URL, including `/v1`, the served model name, a display label and the server's API key if required. Use the model name returned by `/v1/models`.

The recorded run used `Qwen3-VL-30B-A3B-Instruct-FP8` on a DGX Spark, served by `nvcr.io/nvidia/vllm:26.03-py3`. See the [vLLM structured output documentation](https://docs.vllm.ai/en/stable/features/structured_outputs/) for server support.

## CLEF

The app connects to a server exposing `GET /health` and `POST /v1/systemone`. Requests contain `model`, `state` and `questions`; camera requests also include `images_base64: [JPEG_BASE64]`. The app reads the action from `answers.action.choice`.

The adapter in `adapters/clef/` serves [CLEF NVFP4](https://huggingface.co/simonlehmann/clef-NVFP4) using vLLM and the model's decision head. You need Docker, NVIDIA GPU support and a GPU capable of running NVFP4. The adapter has been used on a DGX Spark.

From the project root, download the weights once and start the adapter:

```bash
mkdir -p .model-cache/huggingface

docker run --rm \
  -v "$PWD/.model-cache/huggingface:/hf" \
  -v "$PWD/adapters/clef:/app:ro" \
  --entrypoint python3 vllm/vllm-openai:v0.23.0 /app/download.py

docker compose -f adapters/clef/compose.yaml up -d
```

Set the CLEF URL to `http://127.0.0.1:8080`. Wait for `/health` to respond before starting a race.

To reuse an existing Hugging Face cache, set `HF_CACHE` to the directory containing `hub/` before running Compose. Free enough GPU memory by stopping other model servers if necessary.

Stop the adapter with:

```bash
docker compose -f adapters/clef/compose.yaml down
```

The adapter pins revision `817ac58ad358f42489980ead62f8bf7cafc628c2`. Model code and weights use their upstream licenses: [Cloudflare/CLEF](https://huggingface.co/Cloudflare/clef) and [the NVFP4 conversion](https://huggingface.co/simonlehmann/clef-NVFP4).

## Jev

Create a key in the [TypeSafe console](https://console.typesafe.ai/keys), enter it in the Jev section of settings, save and click **Comprobar Jev**. Select Jev and LiDAR input. Camera mode is unavailable for this connector.

The connector sends `{model, state, questions}` to `https://api.typesafe.ai/v1/systemone` and reads `answers.action.choice` and its probabilities. The default model is `jev-1.13.0`; change `jevModel` in `.connections.json` if needed. The access check uses `GET /v1/models`.

This connector follows the [TypeSafe API](https://docs.typesafe.ai/api). It has not been tested with a live TypeSafe key. Jev is not part of the included camera runs.

## Other chat models

Enter a Chat Completions base URL, served model name and optional API key under **Otro LLM o servidores locales**, then select **Otro LLM** in the model menu.

This connector asks for JSON without requiring JSON Schema. It accepts `LEFT` or `RIGHT`; invalid or ambiguous responses are recorded as errors. Camera mode requires a model that accepts images.
