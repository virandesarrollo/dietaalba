function formatExerciseSets(exercise) {
  if (exercise.sets.length === 0) return ['  Sin series'];
  return exercise.sets.map((set, index) =>
    `  Serie ${index + 1}: ${set.weightKg} kg × ${set.reps} reps · ${set.isCompleted ? 'realizada' : 'pendiente'}`,
  );
}

export function formatWorkoutShareText(dateLabel, blocks) {
  const lines = [`Entrenamiento · ${dateLabel}`];

  blocks.forEach((block, blockIndex) => {
    lines.push('');
    if (block.supersetId) {
      lines.push(`Superserie ${blockIndex + 1}`);
      block.exercises.forEach((exercise, exerciseIndex) => {
        lines.push(`${String.fromCharCode(65 + exerciseIndex)}. ${exercise.name}`);
        lines.push(...formatExerciseSets(exercise));
      });
      return;
    }

    const exercise = block.exercises[0];
    if (!exercise) return;
    lines.push(`Ejercicio ${blockIndex + 1} · ${exercise.name}`);
    lines.push(...formatExerciseSets(exercise));
  });

  return lines.join('\n');
}
