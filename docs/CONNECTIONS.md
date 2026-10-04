# Conectar tus modelos

La aplicación necesita **URLs de inferencia**, no acceso a los archivos de pesos. Puedes ejecutar los servidores en el mismo equipo o acceder a otra máquina mediante tu propia conexión privada. No se incluyen credenciales, nombres de equipos ni automatizaciones de infraestructura personal.

## GPT de OpenAI

1. Crea una clave en tu proyecto de [OpenAI](https://platform.openai.com/api-keys) con acceso al modelo y facturación disponible.
2. Abre ⚙ → **OpenAI**. Pega la clave y guarda las conexiones. Los campos vacíos conservan la configuración anterior.
3. Pulsa **Comprobar OpenAI**: comprueba acceso al modelo sin hacer una inferencia.
4. Selecciona GPT, Cámara, pista 17 y 6 m/s. **Preparar modelo** realiza una inferencia real facturable con el robot inmóvil; después pulsa Iniciar carrera.

La muestra publicada usa `gpt-4.1-mini-2025-04-14`, un snapshot fijo. [GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini) admite imágenes y no introduce una etapa de razonamiento. El conector usa Chat Completions con JSON Schema estricto, temperatura 0 y máximo 32 tokens de salida. La red sigue formando parte del tiempo medido; esta elección no garantiza una latencia concreta.

Este conector se ha comprobado con ese modelo. Otros modelos pueden requerir parámetros diferentes; no asumas que cambiar solo el nombre basta para todos los modelos de OpenAI.

## Jev de TypeSafe: texto/LiDAR, no visión

Crea una clave en [la consola oficial de TypeSafe](https://console.typesafe.ai/keys). En ⚙ → **Jev**, pégala, guarda y pulsa **Comprobar Jev**. Selecciona Jev y Láser. El selector impide activar Cámara para Jev.

El adaptador envía `{model, state, questions}` a `https://api.typesafe.ai/v1/systemone`, con Bearer en el servidor. La versión de ejemplo es `jev-1.13.0`; puedes editar `jevModel` en tu configuración local o usar un alias disponible para tu cuenta. Se valida `answers.action.choice` y se conservan las probabilidades.

No se incluye Jev en el vídeo de visión. La integración está implementada y contrastada con su [API oficial](https://docs.typesafe.ai/api), pero no se ha probado en vivo sin una clave TypeSafe. El botón de comprobación usa `GET /v1/models`, sin ejecutar decisiones.

## Qwen u otro servidor compatible

Prepara un servidor que acepte `POST /v1/chat/completions`, imágenes `image_url` con data URL y `response_format` JSON Schema. En ⚙ → **Otro LLM o servidores locales**, introduce la URL base de Qwen (terminada en `/v1`), el nombre publicado por el servidor, una etiqueta y la clave si requiere autenticación. Puedes consultar su `GET /v1/models` para conocer el nombre servido.

Para Qwen se exige una respuesta estructurada con `action: LEFT | RIGHT`. vLLM admite [salidas estructuradas](https://docs.vllm.ai/en/stable/features/structured_outputs/). La muestra usa Qwen3-VL-30B-A3B-Instruct-FP8 en `nvcr.io/nvidia/vllm:26.03-py3`, en un DGX Spark. No se descargan pesos desde la aplicación.

**Otro LLM** mantiene un adaptador de chat genérico que solicita JSON, sin forzar JSON Schema para conservar compatibilidad. Respuestas inválidas se registran como errores; no hay una acción de sustitución.

## CLEF

La aplicación espera `GET /health` y `POST /v1/systemone`. Para visión, el adaptador acepta `images_base64: [JPEG_BASE64]` junto con `model`, `state` y `questions`. La respuesta incluye `answers.action.choice`, probabilidades y el identificador del modelo.

El adaptador opcional de `adapters/clef` permite reproducir esta interfaz con el modelo público [CLEF NVFP4](https://huggingface.co/simonlehmann/clef-NVFP4). Requiere Docker con acceso a una GPU compatible con NVFP4 y memoria suficiente; fue comprobado en DGX Spark. No es un contenedor de chat convencional: ejecuta el backbone como pooling y la cabeza de decisiones de CLEF. Utiliza el código publicado en el snapshot fijado del modelo.

Desde la raíz del proyecto, descarga los pesos **una vez** (descarga grande, no incluida en el repositorio):

```bash
mkdir -p .model-cache/huggingface

docker run --rm \
  -v "$PWD/.model-cache/huggingface:/hf" \
  -v "$PWD/adapters/clef:/app:ro" \
  --entrypoint python3 vllm/vllm-openai:v0.23.0 /app/download.py

docker compose -f adapters/clef/compose.yaml up -d
```

Configura la URL CLEF como `http://127.0.0.1:8080`. Si ya tienes caché Hugging Face, configura `HF_CACHE` antes de iniciar Compose; debe ser la carpeta que contiene `hub/`. Espera a que `/health` responda antes de preparar la carrera. Detén otros servidores que compitan por la misma memoria. No se inicia ni se detiene infraestructura externa en la distribución pública.

Los pesos y su código tienen sus propias licencias. Véase [Cloudflare/CLEF](https://huggingface.co/Cloudflare/clef) y el repositorio de la cuantización; esta app no los redistribuye.
