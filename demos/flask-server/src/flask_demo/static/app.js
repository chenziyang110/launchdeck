const form = document.querySelector("#note-form");
const textInput = document.querySelector("#note-text");
const submitButton = document.querySelector("#submit-button");
const characterCount = document.querySelector("#character-count");
const formMessage = document.querySelector("#form-message");
const notesList = document.querySelector("#notes-list");
const noteCount = document.querySelector("#note-count");
const noteTemplate = document.querySelector("#note-template");

function setMessage(message = "", type = "status") {
  formMessage.textContent = message;
  formMessage.classList.toggle("error", type === "error");
}

function updateCount(count) {
  noteCount.textContent = `${count} ${count === 1 ? "note" : "notes"}`;
}

function renderEmptyState() {
  notesList.innerHTML = '<div class="empty-state">No notes yet. Add the first useful thought.</div>';
  updateCount(0);
}

function makeNoteCard(note, index) {
  const fragment = noteTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".note-card");
  const number = fragment.querySelector(".note-number");
  const text = fragment.querySelector(".note-text");
  const deleteButton = fragment.querySelector(".delete-button");

  card.dataset.noteId = note.id;
  number.textContent = String(index + 1).padStart(2, "0");
  text.textContent = note.text;
  deleteButton.setAttribute("aria-label", `Delete note ${index + 1}`);
  deleteButton.addEventListener("click", () => deleteNote(note.id, deleteButton));
  return fragment;
}

function renderNotes(notes) {
  notesList.replaceChildren();
  notes.forEach((note, index) => notesList.append(makeNoteCard(note, index)));
  notesList.setAttribute("aria-busy", "false");
  if (notes.length === 0) {
    renderEmptyState();
  } else {
    updateCount(notes.length);
  }
}

async function loadNotes() {
  notesList.setAttribute("aria-busy", "true");
  try {
    const response = await fetch("/api/notes");
    if (!response.ok) throw new Error("Could not load notes.");
    const data = await response.json();
    renderNotes(data.items);
  } catch (error) {
    notesList.innerHTML = `<div class="error-state">${error.message}</div>`;
    notesList.setAttribute("aria-busy", "false");
  }
}

async function deleteNote(noteId, button) {
  button.disabled = true;
  button.textContent = "Deleting…";
  try {
    const response = await fetch(`/api/notes/${noteId}`, { method: "DELETE" });
    if (!response.ok) throw new Error("Could not delete the note.");
    await loadNotes();
    setMessage("Note deleted.");
  } catch (error) {
    button.disabled = false;
    button.textContent = "Delete";
    setMessage(error.message, "error");
  }
}

textInput.addEventListener("input", () => {
  characterCount.textContent = `${textInput.value.length} / 280`;
  setMessage();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = textInput.value.trim();
  if (!text) {
    setMessage("Write a note before adding it.", "error");
    textInput.focus();
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Adding…";
  setMessage();
  try {
    const response = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not add the note.");
    textInput.value = "";
    characterCount.textContent = "0 / 280";
    setMessage("Note added.");
    await loadNotes();
    textInput.focus();
  } catch (error) {
    setMessage(error.message, "error");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Add note";
  }
});

loadNotes();
