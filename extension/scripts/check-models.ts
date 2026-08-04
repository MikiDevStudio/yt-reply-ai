/** Ad-hoc: confirm model ids exist in the live catalogue and print their prices. */
import { fetchModels } from '../lib/openrouter/client';

const models = await fetchModels();

for (const id of process.argv.slice(2)) {
  const model = models.find((m) => m.id === id);
  console.log(
    model
      ? `FOUND    ${model.id}  ctx=${model.contextLength}  in=${model.promptPrice}  out=${model.completionPrice}`
      : `MISSING  ${id}`,
  );
}

console.log('\nAll Gemini models in the catalogue:');
for (const model of models.filter((m) => m.id.includes('gemini'))) {
  console.log(
    `  ${model.id.padEnd(48)} ctx=${String(model.contextLength).padEnd(9)} in=${model.promptPrice} out=${model.completionPrice}`,
  );
}
