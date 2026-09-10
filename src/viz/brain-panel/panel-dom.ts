import { ROLE_NAMES, type RoleFiring } from "./role-monitor";
import { roleBarStyle, regionBarOpacity } from "./panel-view";

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls: string,
  text = "",
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = cls;
  node.textContent = text;
  return node;
}
export function createPanelDom(groups: number[], onGroup: (g: number, visible: boolean) => void) {
  const root = el("section", "brain-panel");
  root.setAttribute("aria-label", "Connectome activity");
  const header = el("button", "brain-panel__header");
  header.type = "button";
  const title = el("span", "brain-panel__title", "connectome");
  const state = el("span", "brain-panel__state", "live");
  header.append(title, state);
  header.setAttribute("aria-controls", "brain-panel-body");
  const body = el("div", "brain-panel__body");
  body.id = "brain-panel-body";
  let expanded = window.innerWidth >= 600;
  const setExpanded = (v: boolean) => {
    expanded = v;
    body.hidden = !v;
    header.setAttribute("aria-expanded", String(v));
  };
  header.addEventListener("click", () => setExpanded(!expanded));
  setExpanded(expanded);
  const meta = el("div", "brain-panel__meta", "01 / synthetic fixture");
  const canvas = el("canvas", "brain-panel__canvas");
  canvas.setAttribute("aria-label", "Synthetic neural network, colored by modeled activity");
  canvas.setAttribute("role", "img");
  const cloudWrap = el("div", "brain-panel__cloud");
  cloudWrap.append(canvas);
  const recovery = el("div", "brain-panel__recovery", "Restoring brain view…");
  recovery.hidden = true;
  recovery.setAttribute("role", "status");
  cloudWrap.append(recovery);
  const count = el("div", "brain-panel__count");
  count.title = "Smoothed neuron activity ≥ 0.32; not a count of individual spike events.";
  const legend = el("div", "brain-panel__legend", "above threshold / simulated");
  const regionRow = el("div", "brain-panel__regions");
  const regionBars = ["g0–2", "g3–4", "g5–7"].map((name, i) => {
    const bar = el("span", `brain-panel__region brain-panel__region--${i}`, name);
    regionRow.append(bar);
    return bar;
  });
  regionRow.title = "Synthetic group categories; anatomical regions arrive with real data.";
  const feed = el("details", "brain-panel__feed");
  feed.open = window.innerHeight > 700;
  const summary = el("summary", "", "mean neural activity");
  feed.append(summary);
  const rows = ROLE_NAMES.map((name) => {
    const row = el("div", "brain-panel__row");
    row.dataset.role = name;
    const label = el("span", "", name.replace("_", " "));
    const track = el("span", "brain-panel__track");
    const fill = el("span", "brain-panel__fill");
    track.append(fill);
    const value = el("span", "brain-panel__value", "0.00");
    row.append(label, track, value);
    feed.append(row);
    return { name, row, fill, value };
  });
  const filters = el("details", "brain-panel__filters");
  filters.append(el("summary", "", "visible groups"));
  const checkboxes = new Map<number, HTMLInputElement>();
  const grid = el("div", "brain-panel__groups");
  for (const g of groups) {
    const label = el("label", "", "");
    const box = el("input", "");
    box.type = "checkbox";
    box.checked = true;
    box.addEventListener("change", () => onGroup(g, box.checked));
    label.append(box, document.createTextNode(`g${g}`));
    grid.append(label);
    checkboxes.set(g, box);
  }
  filters.append(grid, el("p", "brain-panel__note", "Visibility only · core paths stay visible"));
  body.append(meta, cloudWrap, count, legend, regionRow, feed, filters);
  root.append(header, body);
  return {
    root,
    canvas,
    recovery,
    checkboxes,
    update(
      values: RoleFiring,
      counts: [number, number, number],
      active: number,
      total: number,
      paused: boolean,
    ) {
      const firing = counts.reduce((a, b) => a + b, 0);
      count.textContent = `${firing} / ${active}`;
      count.dataset.firing = String(firing);
      legend.textContent = `above threshold · ${active} of ${total} simulated`;
      state.textContent = paused ? "paused" : "live";
      root.dataset.paused = String(paused);
      regionBars.forEach((bar, i) => {
        bar.style.setProperty("--region-opacity", String(regionBarOpacity(counts[i]!, firing)));
        bar.title = `${counts[i]} above threshold`;
      });
      for (const { name, row, fill, value } of rows) {
        const style = roleBarStyle(name, values[name]);
        fill.style.width = `${style.widthPct}%`;
        row.dataset.ramp = style.ramp;
        row.dataset.hot = String(style.glow);
        value.textContent = values[name].toFixed(2);
      }
    },
  };
}
