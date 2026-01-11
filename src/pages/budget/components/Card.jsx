import React from "react";

export default function Card({ title, subtitle, right, children }) {
  return (
    <div className="b-card">
      <div className="b-card__head">
        <div>
          <div className="b-title">{title}</div>
          {subtitle ? <div className="b-subtle">{subtitle}</div> : null}
        </div>
        {right ? <div>{right}</div> : null}
      </div>
      {children}
    </div>
  );
}
