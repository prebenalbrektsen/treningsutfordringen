import { MERGE_BREAK_MIN, type MergeMode } from "@/lib/merge-rule";

/** Whether participants may merge workouts (e.g. strength + run) into one before check-in. */
export function MergeModeSelect({ value = "off" }: { value?: MergeMode }) {
  return (
    <>
      <label className="block">
        <span className="label">Slå sammen økter (styrke + løping = én økt)</span>
        <select name="merge_mode" className="field" defaultValue={value}>
          <option value="off">Nei – hver økt teller for seg</option>
          <option value="back_to_back">Bare rett etter hverandre</option>
          <option value="same_day">Alle økter samme dag</option>
        </select>
      </label>
      <p className="-mt-1 text-xs text-muted">«Rett etter hverandre» = samme dag, maks {MERGE_BREAK_MIN} min pause. Deltakeren slår dem sammen selv før innsjekk, og minuttene legges sammen. Alle ser at økta er sammenslått, og den som styrer kan underkjenne som vanlig.</p>
    </>
  );
}
