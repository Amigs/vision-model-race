export async function loadSentImages(runs) {
  return Promise.all(
    runs.map((run) =>
      Promise.all(
        run.decisions.map(async (decision) => {
          if (!decision.image_base64) return null;
          const image = new Image();
          image.src = "data:image/jpeg;base64," + decision.image_base64;
          await image.decode();
          return image;
        }),
      ),
    ),
  );
}
export function sentImageAt(run, images, time) {
  let index = 0;
  for (let n = 0; n < run.decisions.length; n++) {
    if (run.decisions[n].started_s <= time) index = n;
    else break;
  }
  return images[index];
}
