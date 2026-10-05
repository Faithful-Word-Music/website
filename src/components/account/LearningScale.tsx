import { cn } from "@/components/ui/cn";
import { LEARNING_STYLES, type LearningStyle } from "@/lib/auth/profile-options";

/**
 * The "by ear <-> sheet music" spectrum, drawn as five stops on a line - like
 * positions on a stave. Each stop sits in its own equal column with its label
 * centred beneath, so labels line up exactly under their stops.
 *
 * No hooks here: the input works inside the (client) profile form, and the
 * display inside the (server) profile view.
 */

/** Line joining the stops: from the centre of the first column to the centre of the last. */
function Track({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("absolute left-[10%] right-[10%] h-px bg-line", className)} />;
}

export function LearningScaleInput({
  name,
  value,
  onChange,
}: {
  name: string;
  value: LearningStyle | null;
  onChange: (value: LearningStyle | null) => void;
}) {
  const chosen = LEARNING_STYLES.find((style) => style.value === value);

  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-ink">How do you play?</legend>
      <p className="-mt-1 text-xs text-muted">
        Somewhere between learning everything by ear and reading everything from the page.
      </p>

      <div className="relative mt-5">
        <Track className="top-[0.6875rem]" />
        <div className="relative grid grid-cols-5">
          {LEARNING_STYLES.map((style) => (
            <label key={style.value} className="group flex cursor-pointer flex-col items-center gap-2 px-1">
              <input
                type="radio"
                name={name}
                value={style.value}
                checked={value === style.value}
                onChange={() => onChange(style.value)}
                className="peer sr-only"
              />
              <span
                aria-hidden="true"
                className={cn(
                  "flex h-[1.375rem] w-[1.375rem] items-center justify-center rounded-full border-2 border-line bg-surface transition-[border-color,background-color,transform,translate,scale,rotate]",
                  "group-hover:border-gold",
                  "peer-checked:scale-110 peer-checked:border-ink peer-checked:bg-ink",
                  "peer-focus-visible:ring-2 peer-focus-visible:ring-gold/50 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface",
                )}
              />
              <span className="text-center text-[0.7rem] leading-snug text-muted transition-colors peer-checked:font-medium peer-checked:text-ink sm:text-xs">
                {style.label}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="mt-4 flex min-h-6 items-baseline justify-between gap-4 text-sm">
        <p className="text-muted">{chosen ? chosen.description : "Choose the stop that fits you best."}</p>
        {chosen ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="shrink-0 text-xs text-muted underline decoration-transparent underline-offset-4 transition-colors hover:text-ink hover:decoration-current"
          >
            Clear
          </button>
        ) : null}
      </div>
    </fieldset>
  );
}

/** Read-only version for the profile page: the five stops with the chosen one filled. */
export function LearningScaleDisplay({ value }: { value: LearningStyle }) {
  return (
    <div className="mt-3" aria-hidden="true">
      <div className="relative">
        <Track className="top-[0.4375rem]" />
        <div className="relative grid grid-cols-5">
          {LEARNING_STYLES.map((style) => (
            <span key={style.value} className="flex justify-center">
              <span
                className={cn(
                  "h-3.5 w-3.5 rounded-full border-2",
                  style.value === value ? "border-ink bg-ink" : "border-line bg-surface",
                )}
              />
            </span>
          ))}
        </div>
      </div>
      <div className="mt-1.5 grid grid-cols-5 text-center text-[0.7rem] text-muted">
        <span>By ear</span>
        <span className="col-start-3">Both</span>
        <span className="col-start-5">Sheet music</span>
      </div>
    </div>
  );
}
