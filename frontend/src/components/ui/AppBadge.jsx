import React from "react";
export default function AppBadge({tone="default",children,className=""}){
  return <span className={`app-badge app-badge--${tone} ${className}`.trim()}>{children}</span>;
}
