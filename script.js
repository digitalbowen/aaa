/* ============================================================
   Personal Website — interactions
   Mobile nav · scroll reveal · skill bars · project filters
   contact form validation · image fallbacks
   ============================================================ */

(function () {
  "use strict";

  /* ----------------------------------------------------------
     1. Mobile navigation
     ---------------------------------------------------------- */
  const navToggle = document.querySelector(".nav-toggle");
  const navLinks = document.getElementById("navLinks");

  function closeMenu() {
    if (!navLinks || !navLinks.classList.contains("open")) return;
    navLinks.classList.remove("open");
    navToggle.setAttribute("aria-expanded", "false");
  }

  if (navToggle && navLinks) {
    navToggle.addEventListener("click", function () {
      const isOpen = navLinks.classList.toggle("open");
      navToggle.setAttribute("aria-expanded", String(isOpen));
    });

    // Close after tapping a link
    navLinks.addEventListener("click", function (event) {
      if (event.target.tagName === "A") closeMenu();
    });

    // Close with Escape
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeMenu();
    });

    // Close when clicking/tapping outside
    document.addEventListener("click", function (event) {
      if (
        navLinks.classList.contains("open") &&
        !navLinks.contains(event.target) &&
        !navToggle.contains(event.target)
      ) {
        closeMenu();
      }
    });
  }

  /* ----------------------------------------------------------
     2. Scroll-reveal animations
     ---------------------------------------------------------- */
  const revealEls = document.querySelectorAll(".reveal");

  if ("IntersectionObserver" in window) {
    const revealObserver = new IntersectionObserver(
      function (entries, observer) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in-view");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );

    revealEls.forEach(function (el) {
      revealObserver.observe(el);
    });
  } else {
    revealEls.forEach(function (el) {
      el.classList.add("in-view");
    });
  }

  /* ----------------------------------------------------------
     3. Animated skill bars (resume page)
     ---------------------------------------------------------- */
  const skillFills = document.querySelectorAll(".skill-bar__fill");

  function fillBars(scope) {
    scope.querySelectorAll(".skill-bar__fill").forEach(function (fill) {
      const level = fill.getAttribute("data-level") || "0";
      fill.style.width = level + "%";
    });
  }

  if (skillFills.length && "IntersectionObserver" in window) {
    const skillObserver = new IntersectionObserver(
      function (entries, observer) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            fillBars(document);
            observer.disconnect();
          }
        });
      },
      { threshold: 0.3 }
    );

    const firstBar = skillFills[0].closest(".panel") || skillFills[0];
    skillObserver.observe(firstBar);
  } else {
    fillBars(document);
  }

  /* ----------------------------------------------------------
     4. To-do list app (projects page)
     ---------------------------------------------------------- */
  const todoForm = document.getElementById("todoForm");

  if (todoForm) {
    const STORAGE_KEY = "alexTodoTasks";
    const todoInput = document.getElementById("todoInput");
    const todoDate = document.getElementById("todoDate");
    const todoError = document.getElementById("todoError");
    const todoList = document.getElementById("todoList");
    const todoEmpty = document.getElementById("todoEmpty");
    const todoCount = document.getElementById("todoCount");
    const emojiPicker = document.getElementById("emojiPicker");
    const emojiBtn = document.getElementById("emojiBtn");
    const emojiPop = document.getElementById("emojiPop");
    const prioPicker = document.getElementById("prioPicker");

    const PRIORITIES = {
      low: { icon: "🌱", label: "Low" },
      medium: { icon: "⚡", label: "Med" },
      high: { icon: "🔥", label: "High" }
    };

    // ---- Supabase (REST) ----
    const SUPABASE_URL = "https://ywwvtehrldneorihfzgh.supabase.co";
    const SUPABASE_KEY = "sb_publishable_EQPYNcQZyJyQtNXdmNSuVw_hf59qR5Z";
    const REST_URL = SUPABASE_URL + "/rest/v1/todos";
    const API_HEADERS = {
      apikey: SUPABASE_KEY,
      Authorization: "Bearer " + SUPABASE_KEY,
      "Content-Type": "application/json"
    };

    // convert a database row into the app's task shape
    function normalizeRow(row) {
      return {
        id: String(row.id),
        text: row.task || "",
        date: row.date || "",
        emoji: row.emoji || "",
        priority: PRIORITIES[row.priority] ? row.priority : "medium",
        done: !!row.is_complete,
        createdAt: row.created_at ? Date.parse(row.created_at) : 0
      };
    }

    async function dbLoadTasks() {
      const res = await fetch(REST_URL + "?select=*&order=created_at.asc", {
        headers: API_HEADERS
      });
      if (!res.ok) throw new Error("load failed: " + res.status);
      const rows = await res.json();
      return rows.map(normalizeRow);
    }

    async function dbAddTask(draft) {
      const res = await fetch(REST_URL, {
        method: "POST",
        headers: Object.assign({ Prefer: "return=representation" }, API_HEADERS),
        body: JSON.stringify({
          task: draft.text,
          date: draft.date,
          is_complete: false,
          emoji: draft.emoji,
          priority: draft.priority
        })
      });
      if (!res.ok) throw new Error("add failed: " + res.status);
      const rows = await res.json();
      return normalizeRow(rows[0]);
    }

    async function dbDeleteTask(id) {
      const res = await fetch(REST_URL + "?id=eq." + encodeURIComponent(id), {
        method: "DELETE",
        headers: API_HEADERS
      });
      if (!res.ok) throw new Error("delete failed: " + res.status);
    }

    async function dbUpdateDone(id, done) {
      const res = await fetch(REST_URL + "?id=eq." + encodeURIComponent(id), {
        method: "PATCH",
        headers: API_HEADERS,
        body: JSON.stringify({ is_complete: done })
      });
      if (!res.ok) throw new Error("update failed: " + res.status);
    }

    // ---- state ----
    // Supabase is the source of truth; localStorage is an offline cache
    let tasks = [];
    let usingCache = false;

    function cacheLoad() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        return [];
      }
    }

    function cacheSave() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
      } catch (e) {
        /* storage unavailable — app still works for this session */
      }
    }

    async function loadTasks() {
      try {
        tasks = await dbLoadTasks();
        usingCache = false;
      } catch (e) {
        // database unreachable — show the cached copy instead
        usingCache = true;
        tasks = cacheLoad();
        showError("Couldn't reach the database — showing tasks saved in this browser.");
      }
      render();
    }

    function localTodayIso() {
      const d = new Date();
      return (
        d.getFullYear() +
        "-" +
        String(d.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(d.getDate()).padStart(2, "0")
      );
    }

    function showError(message) {
      todoError.textContent = message;
      todoError.classList.add("show");
    }

    function clearError() {
      todoError.textContent = "";
      todoError.classList.remove("show");
    }

    // ---- emoji & priority pickers ----
    let currentEmoji = "📌";
    let currentPrio = "medium";

    function closeEmojiPop() {
      emojiPop.classList.remove("open");
      emojiBtn.setAttribute("aria-expanded", "false");
    }

    emojiBtn.addEventListener("click", function () {
      const open = emojiPop.classList.toggle("open");
      emojiBtn.setAttribute("aria-expanded", String(open));
    });

    emojiPop.addEventListener("click", function (event) {
      const option = event.target.closest(".emoji-option");
      if (!option) return;

      currentEmoji = option.dataset.emoji || "";
      emojiBtn.textContent = currentEmoji || "—";
      emojiBtn.classList.toggle("emoji-picker__btn--empty", !currentEmoji);
      emojiBtn.setAttribute(
        "aria-label",
        currentEmoji
          ? "Task emoji: " + currentEmoji + " — change"
          : "Task emoji: none — choose"
      );

      emojiPop.querySelectorAll(".emoji-option").forEach(function (opt) {
        const selected = opt === option;
        opt.classList.toggle("is-selected", selected);
        opt.setAttribute("aria-selected", String(selected));
      });
      closeEmojiPop();
    });

    // close the popover when clicking/tapping elsewhere or pressing Escape
    document.addEventListener("click", function (event) {
      if (!emojiPicker.contains(event.target)) closeEmojiPop();
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeEmojiPop();
    });

    prioPicker.addEventListener("click", function (event) {
      const btn = event.target.closest(".prio-btn");
      if (!btn) return;

      currentPrio = btn.dataset.prio;
      prioPicker.querySelectorAll(".prio-btn").forEach(function (b) {
        const selected = b === btn;
        b.classList.toggle("is-selected", selected);
        b.setAttribute("aria-checked", String(selected));
      });
    });

    // ---- add a task ----
    todoForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      const text = todoInput.value.trim();
      const date = todoDate.value;

      if (text.length < 2) {
        showError("Please enter a task (at least 2 characters).");
        todoInput.focus();
        return;
      }
      if (!date) {
        showError("Please pick a date on the calendar.");
        todoDate.focus();
        return;
      }

      const addBtn = todoForm.querySelector(".todo-add-btn");
      addBtn.disabled = true;
      try {
        const row = await dbAddTask({
          text: text,
          date: date,
          emoji: currentEmoji,
          priority: currentPrio
        });
        tasks.push(row);
        cacheSave();
        render();
        // keep the selected date handy; clear just the text
        todoInput.value = "";
        clearError();
        todoInput.focus();
      } catch (e) {
        showError("Couldn't save to the database — please try again.");
      } finally {
        addBtn.disabled = false;
      }
    });

    [todoInput, todoDate].forEach(function (el) {
      el.addEventListener("input", clearError);
    });

    // ---- mark done (delegated) ----
    todoList.addEventListener("change", async function (event) {
      if (!event.target.classList.contains("todo-check__input")) return;

      const item = event.target.closest(".todo-item");
      const task = tasks.find(function (t) {
        return t.id === item.dataset.id;
      });
      if (!task) return;

      const checked = event.target.checked;
      try {
        await dbUpdateDone(task.id, checked);
        task.done = checked;
        item.classList.toggle("todo-item--done", checked);
        cacheSave();
        updateCount();
      } catch (e) {
        event.target.checked = !checked; // revert the checkbox
        showError("Couldn't update the task — check your connection.");
      }
    });

    // ---- delete (delegated): fade out, remove from db + list ----
    todoList.addEventListener("click", function (event) {
      const deleteBtn = event.target.closest(".todo-delete");
      if (!deleteBtn) return;

      const item = deleteBtn.closest(".todo-item");
      const id = item.dataset.id;

      item.classList.add("todo-item--removing");
      dbDeleteTask(id)
        .then(function () {
          tasks = tasks.filter(function (t) {
            return t.id !== id;
          });
          cacheSave();
          render();
        })
        .catch(function () {
          item.classList.remove("todo-item--removing");
          showError("Couldn't delete the task — check your connection.");
        });
    });

    // ---- rendering ----
    function render() {
      // undone first, then done; inside each group, soonest date first
      const sorted = tasks.slice().sort(function (a, b) {
        if (a.done !== b.done) return a.done ? 1 : -1;
        if (a.date !== b.date) return a.date < b.date ? -1 : 1;
        return a.createdAt - b.createdAt;
      });

      todoList.innerHTML = "";
      sorted.forEach(function (task) {
        todoList.appendChild(renderItem(task));
      });

      todoEmpty.classList.toggle("is-hidden", tasks.length > 0);
      updateCount();
    }

    function updateCount() {
      const total = tasks.length;
      const done = tasks.filter(function (t) {
        return t.done;
      }).length;

      if (total === 0) {
        todoCount.textContent = "0 tasks";
      } else if (done === 0) {
        todoCount.textContent = total + (total === 1 ? " task" : " tasks");
      } else {
        todoCount.textContent = done + " of " + total + " done";
      }
    }

    function renderItem(task) {
      const li = document.createElement("li");
      li.className = "todo-item" + (task.done ? " todo-item--done" : "");
      li.dataset.id = task.id;

      // checkbox
      const checkLabel = document.createElement("label");
      checkLabel.className = "todo-check";
      const checkInput = document.createElement("input");
      checkInput.type = "checkbox";
      checkInput.className = "todo-check__input";
      checkInput.checked = task.done;
      checkInput.setAttribute("aria-label", "Mark \"" + task.text + "\" as done");
      const checkBox = document.createElement("span");
      checkBox.className = "todo-check__box";
      checkLabel.appendChild(checkInput);
      checkLabel.appendChild(checkBox);

      // text (with optional emoji) + date/priority meta
      const content = document.createElement("div");
      content.className = "todo-content";

      const textEl = document.createElement("span");
      textEl.className = "todo-text";
      if (task.emoji) {
        const emojiEl = document.createElement("span");
        emojiEl.className = "todo-emoji";
        emojiEl.setAttribute("aria-hidden", "true");
        emojiEl.textContent = task.emoji;
        textEl.appendChild(emojiEl);
      }
      textEl.appendChild(document.createTextNode(task.text));

      const meta = document.createElement("div");
      meta.className = "todo-meta";

      if (task.date) {
        const dateEl = document.createElement("span");
        dateEl.className = "todo-date";
        dateEl.textContent = "📅 " + formatDate(task.date);
        meta.appendChild(dateEl);
      }

      const prioKey = PRIORITIES[task.priority] ? task.priority : "medium";
      const prioEl = document.createElement("span");
      prioEl.className = "todo-prio todo-prio--" + prioKey;
      prioEl.textContent = PRIORITIES[prioKey].icon + " " + PRIORITIES[prioKey].label;
      meta.appendChild(prioEl);

      content.appendChild(textEl);
      content.appendChild(meta);

      // delete
      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "todo-delete";
      deleteBtn.setAttribute("aria-label", "Delete \"" + task.text + "\"");
      deleteBtn.textContent = "×";

      li.appendChild(checkLabel);
      li.appendChild(content);
      li.appendChild(deleteBtn);
      return li;
    }

    function formatDate(iso) {
      const parts = iso.split("-");
      const date = new Date(+parts[0], +parts[1] - 1, +parts[2]);
      const today = new Date();
      const tomorrow = new Date();
      tomorrow.setDate(today.getDate() + 1);

      if (date.toDateString() === today.toDateString()) return "Today";
      if (date.toDateString() === tomorrow.toDateString()) return "Tomorrow";

      return date.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric"
      });
    }

    // ---- init ----
    if (!todoDate.value) todoDate.value = localTodayIso();
    loadTasks();
  }

  /* ----------------------------------------------------------
     5. Contact form validation (contact page)
     ---------------------------------------------------------- */
  const contactForm = document.getElementById("contactForm");
  const formSuccess = document.getElementById("formSuccess");

  function setFieldError(input, hasError) {
    const field = input.closest(".field");
    field.classList.toggle("has-error", hasError);
    input.classList.toggle("invalid", hasError);
  }

  function isEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
  }

  if (contactForm) {
    const inputs = contactForm.querySelectorAll("input, textarea");

    // Clear an error as soon as the user fixes the field
    inputs.forEach(function (input) {
      input.addEventListener("input", function () {
        if (input.classList.contains("invalid")) {
          setFieldError(input, false);
        }
      });
    });

    contactForm.addEventListener("submit", function (event) {
      event.preventDefault();

      const name = contactForm.elements.name;
      const email = contactForm.elements.email;
      const subject = contactForm.elements.subject;
      const message = contactForm.elements.message;

      let valid = true;

      if (name.value.trim().length < 2) {
        setFieldError(name, true);
        valid = false;
      }
      if (!isEmail(email.value.trim())) {
        setFieldError(email, true);
        valid = false;
      }
      if (subject.value.trim().length < 2) {
        setFieldError(subject, true);
        valid = false;
      }
      if (message.value.trim().length < 10) {
        setFieldError(message, true);
        valid = false;
      }

      if (!valid) {
        const firstInvalid = contactForm.querySelector(".invalid");
        if (firstInvalid) firstInvalid.focus();
        return;
      }

      // Demo only — simulate sending, then show a friendly confirmation
      contactForm.style.display = "none";
      formSuccess.classList.add("show");
    });
  }

  /* ----------------------------------------------------------
     6. Print / Save as PDF (resume page)
     ---------------------------------------------------------- */
  const printBtn = document.getElementById("printBtn");
  if (printBtn) {
    printBtn.addEventListener("click", function () {
      window.print();
    });
  }

  /* ----------------------------------------------------------
     7. Friendly fallbacks if images can't load
     ---------------------------------------------------------- */
  function avatarSvg() {
    return (
      '<svg class="avatar-fallback" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Smiley face placeholder">' +
      '<defs><linearGradient id="avGrad" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#3b86b4"/><stop offset="1" stop-color="#48a887"/>' +
      "</linearGradient></defs>" +
      '<circle cx="100" cy="100" r="96" fill="url(#avGrad)"/>' +
      '<circle cx="74" cy="84" r="10" fill="#fff"/>' +
      '<circle cx="126" cy="84" r="10" fill="#fff"/>' +
      '<circle cx="62" cy="112" r="8" fill="#9ccadd" opacity="0.7"/>' +
      '<circle cx="138" cy="112" r="8" fill="#9ccadd" opacity="0.7"/>' +
      '<path d="M68 122 Q100 154 132 122" stroke="#fff" stroke-width="8" fill="none" stroke-linecap="round"/>' +
      "</svg>"
    );
  }

  function projectSvg() {
    return (
      '<svg class="project-fallback" viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Project image placeholder" style="width:100%;height:100%;display:block;">' +
      '<defs><linearGradient id="pjGrad" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#dcebf4"/><stop offset="1" stop-color="#ddf0e8"/>' +
      "</linearGradient></defs>" +
      '<rect width="320" height="200" fill="url(#pjGrad)"/>' +
      '<circle cx="160" cy="92" r="42" fill="#fff" opacity="0.85"/>' +
      '<text x="160" y="108" font-size="42" text-anchor="middle">🖼️</text>' +
      '<text x="160" y="162" font-size="15" text-anchor="middle" fill="#607988" font-family="Segoe UI, sans-serif" font-weight="700">Project preview</text>' +
      "</svg>"
    );
  }

  document.querySelectorAll("img[data-fallback]").forEach(function (img) {
    img.addEventListener("error", function () {
      const wrapper = img.parentNode;
      const type = img.getAttribute("data-fallback");
      wrapper.insertAdjacentHTML(
        "beforeend",
        type === "avatar" ? avatarSvg() : projectSvg()
      );
      img.remove();
    });
  });

  /* ----------------------------------------------------------
     8. Occasional friendly wave on the homepage
     ---------------------------------------------------------- */
  const wave = document.querySelector(".hero h1 .wave");
  if (wave && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    function wag() {
      wave.animate(
        [
          { transform: "rotate(0deg)" },
          { transform: "rotate(22deg)" },
          { transform: "rotate(-10deg)" },
          { transform: "rotate(20deg)" },
          { transform: "rotate(0deg)" }
        ],
        { duration: 900, easing: "ease-in-out" }
      );
    }

    setTimeout(wag, 700);
    setInterval(wag, 5000);
  }
})();
