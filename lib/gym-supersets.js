export function buildWorkoutBlocks(cards, supersets) {
  const byId = new Map(cards.map((card) => [card.id, card]));
  const pairs = new Map();
  for (const pair of supersets) {
    const first = byId.get(pair.first_exercise_id);
    const second = byId.get(pair.second_exercise_id);
    if (!first || !second || first.id === second.id || pairs.has(first.id) || pairs.has(second.id)) continue;
    const block = { id: pair.id, supersetId: pair.id, exercises: [first, second] };
    pairs.set(first.id, block);
    pairs.set(second.id, block);
  }
  const included = new Set();
  const blocks = [];
  for (const card of cards) {
    if (included.has(card.id)) continue;
    const block = pairs.get(card.id) ?? { id: card.id, supersetId: null, exercises: [card] };
    blocks.push(block);
    for (const exercise of block.exercises) included.add(exercise.id);
  }
  return blocks;
}
