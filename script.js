const views = [...document.querySelectorAll("[data-view]")];
const navButtons = [...document.querySelectorAll(".bottom-nav [data-go]")];
const goButtons = [...document.querySelectorAll("[data-go]")];
const phone = document.querySelector(".phone");

function setView(name) {
  views.forEach((view) => {
    view.classList.toggle("active-view", view.dataset.view === name);
  });

  navButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.go === name);
  });

  phone.className = `phone view-${name}`;
}

goButtons.forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.go));
});
