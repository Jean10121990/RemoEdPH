import React from "react";

const ITEMS = [
  {
    icon: "fa-house-lock",
    tint: "blue",
    title: "Safe & Comfortable",
    body: "Learn in the safety and comfort of your own home. No need to travel or worry about safety!",
  },
  {
    icon: "fa-calendar-days",
    tint: "green",
    title: "Flexible Schedule",
    body: "Choose class times that work for your family. Learn at your own pace!",
  },
  {
    icon: "fa-people-roof",
    tint: "orange",
    title: "Family Involvement",
    body: "Parents can watch and support their child's learning journey together!",
  },
  {
    icon: "fa-puzzle-piece",
    tint: "violet",
    title: "Fun & Interactive",
    body: "Play games, do activities, and learn through fun interactive lessons!",
  },
  {
    icon: "fa-chalkboard-user",
    tint: "teal",
    title: "Expert Teachers",
    body: "Learn from experienced, friendly teachers who love teaching kids!",
  },
  {
    icon: "fa-mobile-screen-button",
    tint: "mint",
    title: "Easy to Use",
    body: "Simple platform designed for kids. Easy for parents to manage too!",
  },
];

export default function BenefitsSection() {
  return (
    <section className="section benefits-section" id="benefits">
      <h2 className="section-title">Why Learn at Home?</h2>
      <div className="benefits-grid">
        {ITEMS.map((item) => (
          <article key={item.title} className="benefit-card">
            <div className="benefit-card__layout">
              <div
                className={`benefit-icon-circle benefit-icon-circle--${item.tint}`}
                aria-hidden="true"
              >
                <i className={`fa-solid ${item.icon}`} />
              </div>
              <div className="benefit-bubble">
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
