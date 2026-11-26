const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

let elements = [];
let selectedId = null;
let nextId = 1;

const canvas = $("#canvas");
const propsContent = $("#propsContent");
const modal = $("#modal");
const installBtn = $("#installBtn");

// ---------- Install ----------
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installBtn.hidden = false;
});
installBtn?.addEventListener("click", async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  installBtn.hidden = true;
});

// ---------- Toolbox ----------
$$(".tool-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const type = btn.dataset.type;
    addElement(type);
  });
});

$("#clearBtn").addEventListener("click", () => {
  if (confirm("Clear all elements?")) {
    elements = [];
    selectedId = null;
    render();
  }
});

function addElement(type) {
  const el = {
    id: nextId++,
    type,
    label: type === "category" ? "New Category" :
           type === "mod" ? "Mod Slot" :
           type === "toggle" ? "New Toggle" :
           type === "slider" ? "New Slider" : "New Button"
  };
  elements.push(el);
  selectedId = el.id;
  render();
}

function render() {
  if (elements.length === 0) {
    canvas.innerHTML = `<div class="empty-hint">Add elements from the left panel</div>`;
  } else {
    canvas.innerHTML = elements.map((el) => `
      <div class="menu-item ${el.type} ${el.id === selectedId ? "selected" : ""}" data-id="${el.id}">
        <span class="label">${escapeHtml(el.label)}</span>
        <span class="type-badge">${el.type}</span>
      </div>
    `).join("");
    canvas.querySelectorAll(".menu-item").forEach((node) => {
      node.addEventListener("click", () => {
        selectedId = +node.dataset.id;
        render();
      });
    });
  }
  renderProps();
}

function renderProps() {
  const el = elements.find((e) => e.id === selectedId);
  if (!el) {
    propsContent.innerHTML = `<p class="hint">Select an element to edit</p>`;
    return;
  }
  propsContent.innerHTML = `
    <div class="props-form">
      <label>Label</label>
      <input type="text" id="propLabel" value="${escapeHtml(el.label)}" />
      <label>Type</label>
      <input type="text" value="${el.type}" disabled />
      <button class="delete-btn" id="deleteEl">Delete Element</button>
    </div>
  `;
  $("#propLabel").addEventListener("input", (e) => {
    el.label = e.target.value;
    render();
    // keep focus
    const input = $("#propLabel");
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  });
  $("#deleteEl").addEventListener("click", () => {
    elements = elements.filter((e) => e.id !== el.id);
    selectedId = null;
    render();
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------- Generate Modal ----------
$("#generateBtn").addEventListener("click", () => {
  modal.classList.remove("hidden");
  const saved = localStorage.getItem("openai_key") || "";
  if (saved) $("#apiKey").value = saved;
});

$("#closeModal").addEventListener("click", () => modal.classList.add("hidden"));

$("#runGenerate").addEventListener("click", async () => {
  const apiKey = $("#apiKey").value.trim();
  const lang = $("#targetLang").value;
  const title = $("#menuTitle").value.trim() || "My Menu";
  const style = $("#menuStyle").value;
  const status = $("#genStatus");
  const codeEl = $("#generatedCode");
  const copyBtn = $("#copyCodeBtn");

  if (!apiKey) {
    status.textContent = "Please enter your OpenAI API key";
    status.className = "status error";
    return;
  }
  localStorage.setItem("openai_key", apiKey);

  if (elements.length === 0) {
    status.textContent = "Add some elements first";
    status.className = "status error";
    return;
  }

  // Build a clean description of the design (template only – no mod logic)
  const design = {
    title,
    style,
    elements: elements.map((e) => ({
      type: e.type,
      label: e.label
    }))
  };

  const langMap = {
    "imgui-cpp": "Dear ImGui C++",
    "imgui-python": "Python with pyimgui or imgui",
    "html-css-js": "modern HTML + CSS + vanilla JavaScript",
    "react": "React functional component with hooks",
    "lua": "Lua suitable for FiveM or Roblox-style menus"
  };

  const prompt = `You are an expert UI coder. Generate a clean, complete, ready-to-use TEMPLATE for a menu based on this design JSON:

${JSON.stringify(design, null, 2)}

Requirements:
- Target: ${langMap[lang] || lang}
- This is ONLY the template / skeleton. Do NOT implement real mod/cheat logic.
- For any element with type "mod", just put a clear placeholder comment or empty function like // TODO: mod logic here
- Make the menu look good and match the requested style ("${style}").
- Include necessary setup code so the user can paste and run it.
- Output ONLY the code, no markdown explanation before or after.`;

  status.textContent = "Generating with OpenAI…";
  status.className = "status";
  codeEl.classList.add("hidden");
  copyBtn.classList.add("hidden");
  $("#runGenerate").disabled = true;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 3000
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `HTTP ${res.status}`);
    }

    const data = await res.json();
    let code = data.choices?.[0]?.message?.content || "";
    // strip markdown fences if present
    code = code.replace(/^```[\w]*\n?/, "").replace(/\n?```$/, "").trim();

    codeEl.textContent = code;
    codeEl.classList.remove("hidden");
    copyBtn.classList.remove("hidden");
    status.textContent = "Template generated successfully";
    status.className = "status success";
  } catch (err) {
    status.textContent = "Error: " + err.message;
    status.className = "status error";
  } finally {
    $("#runGenerate").disabled = false;
  }
});

$("#copyCodeBtn").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("#generatedCode").textContent);
    $("#genStatus").textContent = "Code copied!";
    $("#genStatus").className = "status success";
  } catch {
    $("#genStatus").textContent = "Could not copy – select manually";
  }
});

// Service worker
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(console.error);
  });
}

// Initial render
render();
