import React from "react";

export default function AppCard({as:Tag="section",title,subtitle,actions,children,className=""}){
  return <Tag className={`app-card ${className}`.trim()}>
    {(title||subtitle||actions)&&<header className="app-card__header">
      <div>{title&&<h3>{title}</h3>}{subtitle&&<p>{subtitle}</p>}</div>
      {actions&&<div className="app-card__actions">{actions}</div>}
    </header>}
    <div className="app-card__body">{children}</div>
  </Tag>;
}
