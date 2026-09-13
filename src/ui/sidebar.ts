import { DEFAULT_HABITAT, generateHabitat } from "../world/habitat";
import type { SceneStore } from "../world/scene-store";
import "./sidebar.css";

/** Move existing live controls without replacing their event handlers. */
export function createSidebar(store: SceneStore, onTab: () => void) {
  const root = document.createElement("aside");
  root.className = "workspace-sidebar";
  root.setAttribute("aria-label", "Playground controls");
  root.innerHTML = `<header><span>FLY PLAYGROUND</span><button class="sidebar-collapse" aria-expanded="true" aria-label="Collapse controls">−</button></header><nav role="tablist" aria-label="Control panels"></nav><div class="sidebar-content"></div>`;
  const nav = root.querySelector("nav")!;
  const content = root.querySelector<HTMLElement>(".sidebar-content")!;
  const tabs: HTMLButtonElement[] = [];
  const panels: HTMLElement[] = [];
  const activate = (index: number) => {
    tabs.forEach((tab, i) => {
      tab.setAttribute("aria-selected", String(i === index));
      tab.tabIndex = i === index ? 0 : -1;
      panels[i]!.hidden = i !== index;
    });
    requestAnimationFrame(onTab);
  };
  for (const [index, name] of ["Brain", "Habitat", "Tuning"].entries()) {
    const tab = document.createElement("button");
    tab.id = `tab-${name}`;
    tab.textContent = name;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", `panel-${name}`);
    tab.addEventListener("click", () => activate(index));
    tab.addEventListener("keydown", (event) => {
      let next = index;
      if (event.key === "ArrowRight") next = (index + 1) % 3;
      else if (event.key === "ArrowLeft") next = (index + 2) % 3;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = 2;
      else return;
      event.preventDefault();
      activate(next);
      tabs[next]!.focus();
    });
    const panel = document.createElement("section");
    panel.id = `panel-${name}`;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", tab.id);
    nav.append(tab);
    content.append(panel);
    tabs.push(tab);
    panels.push(panel);
  }
  const move = (selector: string, panel: number) => {
    const node = document.querySelector<HTMLElement>(selector);
    if (node) panels[panel]!.append(node);
  };
  const flies = document.querySelector<HTMLElement>(".experiment-ui")!;
  const roster = flies.querySelector<HTMLElement>(".fly-roster")!;
  // Keep the roster inside its owner so live reconciliation and theme still work.
  roster.setAttribute("aria-label", "Select a fly");
  const dock = document.createElement("details");
  dock.className = "fly-controls-dock";
  dock.open = true;
  const summary = document.createElement("summary");
  summary.textContent = "Fly controls";
  dock.append(summary);
  for (const child of [...flies.children]) if (child !== roster) dock.append(child);
  const settings = document.createElement("div");
  settings.className = "fly-settings-row";
  for (const child of [...dock.children]) {
    if (child.matches(".experiment-depth, .experimental-inputs")) settings.append(child);
  }
  dock.querySelector(".experiment-actions")!.after(settings);
  flies.append(dock);
  const consolePanel = flies.querySelector<HTMLDetailsElement>(".experiment-console")!;
  consolePanel.open = false;
  const habitat = document.createElement("form");
  habitat.className = "habitat-controls";
  habitat.innerHTML = `<h2>Living space</h2><p>Connected rooms with open doorways and a clear flight corridor.</p>
  <label>Rooms <input name="rooms" type="number" min="1" max="4" value="3" required></label>
  <label>Light sources <input name="lights" type="number" min="0" max="12" value="4" required></label>
  <label>Flowers <input name="flowers" type="number" min="0" max="80" value="24" required></label>
  <label>Layout seed <input name="seed" type="number" min="0" max="4294967295" value="731" required></label>
  <div><button type="submit">Generate habitat</button> <button type="button" class="shuffle-habitat">Shuffle seed</button></div>
  <p class="habitat-status" role="status"></p><p>Generate replaces the scene. Reset trial in Fly controls moves flies to its entrance. Flowers are visual obstacles; scent and feeding are not mapped yet.</p>`;
  const status = habitat.querySelector<HTMLElement>(".habitat-status")!;
  const sync = () => {
    const scene = store.snapshot();
    status.textContent = `Current scene · ${scene.lights.length} lights · ${scene.objects.filter((o) => o.kind === "flower").length} flowers`;
  };
  sync();
  const unsubscribe = store.subscribe(sync);
  habitat.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(habitat);
    const options = { ...DEFAULT_HABITAT };
    for (const key of ["rooms", "lights", "flowers", "seed"] as const)
      options[key] = Number(form.get(key));
    store.replace(generateHabitat(options));
  });
  habitat.querySelector(".shuffle-habitat")!.addEventListener("click", () => {
    habitat.querySelector<HTMLInputElement>('[name="seed"]')!.value = String(
      crypto.getRandomValues(new Uint32Array(1))[0],
    );
    habitat.requestSubmit();
  });
  panels[1]!.append(habitat);
  move(".hud-scene", 1);
  move(".anatomy-panel", 0);
  const depth = document.querySelector<HTMLElement>(".hud-depth");
  if (depth) panels[0]!.querySelector(".anatomy-viewport")!.after(depth);
  move(".hud-lif", 2);
  move(".hud-meters", 2);
  for (const element of root.querySelectorAll<HTMLElement>("[data-collapsed]"))
    element.dataset.collapsed = "false";
  const collapse = root.querySelector<HTMLButtonElement>(".sidebar-collapse")!;
  collapse.addEventListener("click", () => {
    const hidden = !content.hidden;
    content.hidden = hidden;
    nav.hidden = hidden;
    collapse.textContent = hidden ? "+" : "−";
    collapse.setAttribute("aria-expanded", String(!hidden));
    collapse.setAttribute("aria-label", hidden ? "Expand controls" : "Collapse controls");
    requestAnimationFrame(onTab);
  });
  document.body.append(root);
  activate(0);
  return {
    dispose() {
      unsubscribe();
      root.remove();
    },
  };
}
