/**
 * A short tap of the phone's vibration, as native apps give on a refresh.
 * Must be called from a tap or a finger lifting (touchend), or phones ignore it.
 *
 * - Android: the Vibration API.
 * - iPhone: Safari has no vibration API. From iOS 18 its native switch
 *   control (`<input type="checkbox" switch>`) ticks the Taptic Engine when
 *   toggled, so a hidden one is toggled. Older iPhones simply stay still.
 */
export function haptic() {
  if (typeof navigator.vibrate === "function") {
    navigator.vibrate(10);
    return;
  }
  const label = document.createElement("label");
  label.setAttribute("aria-hidden", "true");
  label.style.display = "none";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", "");
  label.appendChild(input);
  document.head.appendChild(label);
  label.click();
  label.remove();
}
