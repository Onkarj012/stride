WorkoutSessionCard from stride-ui-kit. Use via `window.Stride.WorkoutSessionCard` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface WorkoutSessionCardProps {
session: { title: string; date: string; durationMin: number; burnKcal: number; exercises: { name: string; sets: { weight: string; reps: number }[] }[] }; index?: number;
}
```
