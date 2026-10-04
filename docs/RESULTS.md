# Resultados de la muestra de visión

Pista **17**, **6 m/s**, cámara **640×360**, meta **120 m**, tres carriles y dos acciones relativas: LEFT / RIGHT. Sin retraso artificial. Curso versión 3, instrucciones versión 5. Fecha de los registros: 4 de octubre de 2026 (UTC).

| Modelo                        | Distancia (m) | Mediana (ms) | Decisiones aplicadas | Respuestas tras finalizar | Errores |
| ----------------------------- | ------------: | -----------: | -------------------: | ------------------------: | ------: |
| Qwen3-VL-30B-A3B-Instruct-FP8 |         31.10 |          533 |                    8 |                         0 |       0 |
| gpt-4.1-mini-2025-04-14       |         45.07 |         2127 |                    3 |                         1 |       0 |
| simonlehmann/clef-NVFP4       |        120.00 |        422.5 |                   36 |                         1 |       0 |

CLEF alcanzó la meta; Qwen y GPT chocaron. No se eliminaron fallos para elegir una carrera ganadora: se usa el primer ensayo completo de cada modelo después del calentamiento con este protocolo. Hubo ensayos de desarrollo anteriores con otras condiciones. No se promedian aquí todas las pruebas de desarrollo.

## Qué ocurrió en los impactos

Qwen mantuvo órdenes RIGHT hasta el impacto en el carril derecho, a 31,1 m. No había una respuesta pendiente en ese instante. GPT mantuvo órdenes LEFT y chocó en el carril izquierdo a 45,1 m; tenía una petición pendiente que respondió LEFT después del choque. Estos hechos no permiten atribuir ambos fallos solo a latencia: también importa la elección de carril. CLEF cambió entre LEFT y RIGHT y alcanzó la meta.

## Qué mide realmente

La mediana considera las respuestas aplicadas durante la carrera, desde la captura hasta procesar la respuesta en el navegador. Incluye captura, servidor local, conexión y modelo. Una respuesta después de un impacto o de alcanzar la meta queda registrada, pero no mueve el robot ni entra en esa mediana. No es una medición aislada de GPU.

Las carreras se ejecutaron por separado, Qwen y CLEF en el mismo DGX Spark, GPT a través de la API de OpenAI. Qwen usó el servidor original NVIDIA vLLM `nvcr.io/nvidia/vllm:26.03-py3`; CLEF usó `vllm/vllm-openai:v0.23.0` con su cabeza de decisiones. Cada modelo recibió una consulta de preparación antes de empezar. La preparación no entra en las cifras de la carrera.

Qwen: `Qwen3-VL-30B-A3B-Instruct-FP8`, MoE. GPT: snapshot `gpt-4.1-mini-2025-04-14`. CLEF: `simonlehmann/clef-NVFP4`, revisión `817ac58ad358f42489980ead62f8bf7cafc628c2`. Esta muestra no compara BF16 con NVFP4.

## Datos auditables y vídeo

[`runs.json`](../public/comparison/runs.json) contiene las imágenes JPEG enviadas, respuestas, probabilidades cuando existen, consumo reportado, posiciones, eventos y tiempos. [`manifest.json`](../public/comparison/manifest.json) identifica el protocolo y el SHA-256 del registro. Las instrucciones y conectores están en `server.mjs`; la física, en `public/physics.mjs`.

El vídeo es una **reproducción sincronizada de trayectorias registradas**, renderizada a 3840×2160 y 30 fps. Interpola entre muestras de posición; no vuelve a consultar modelos ni inventa nuevas decisiones. La captura de posiciones tuvo una frecuencia variable según la carga del navegador. El vídeo conserva los tiempos originales y muestra 2 segundos de preparación y 5 segundos de resultado final.

La edición vertical para LinkedIn presenta los mismos ensayos en secuencia: Qwen, GPT y CLEF. Se exporta a 1080×1920 y 30 fps, con 1,5 segundos de presentación y 2,5 segundos de resultado por modelo. No acelera ni recorta las carreras.

## Límites

Un ensayo por modelo, una pista y un prompt no permiten inferir superioridad general. La ejecución depende de la red, carga del navegador, hardware, representación de la cámara y política de acciones. El menor tiempo de respuesta tampoco garantiza recorrer más distancia. No se igualan presupuestos de cómputo ni entrenamiento de los modelos.

Jev queda fuera porque su integración aquí es de texto/LiDAR. No se ha validado en vivo sin una clave de TypeSafe. La demostración no prueba capacidad de conducción ni seguridad en robótica física.
