import type { Workout } from "./challenge";

/** What a person lets others see of their Strava workouts. Manual workouts are typed into this app and always shown. */
export type SharePrefs = { share_distance: boolean; share_elevation: boolean; share_hr: boolean; share_title: boolean };

export const SHARE_OPTIONS: { key: keyof SharePrefs; label: string; hint: string }[] = [
  { key: "share_distance", label: "Distanse og tempo", hint: "Teller også på km-tavlene" },
  { key: "share_elevation", label: "Høydemeter", hint: "Teller også på høydemeter-tavla" },
  { key: "share_hr", label: "Snittpuls", hint: "Helseopplysning – bare hvis du vil" },
  { key: "share_title", label: "Navnet på økta fra Strava", hint: "F.eks. «Morgenløp med Ida»" },
];

/** Removes the Strava details a person hasn't chosen to share. Use for anyone who isn't the owner. */
export function redact<W extends Pick<Workout, "source" | "distance_m" | "elevation_m" | "avg_hr" | "title">>(w: W, p: SharePrefs): W {
  if (w.source !== "strava") return w;
  return {
    ...w,
    distance_m: p.share_distance ? w.distance_m : null,
    elevation_m: p.share_elevation ? w.elevation_m : null,
    avg_hr: p.share_hr ? w.avg_hr : null,
    title: p.share_title ? w.title : null,
  };
}
