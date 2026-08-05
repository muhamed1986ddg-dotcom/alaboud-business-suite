import React from "react";
export default function AppToolbar({children,actions,className=""}){
  return <div className={`app-toolbar ${className}`.trim()}><div className="app-toolbar__content">{children}</div>{actions&&<div className="app-toolbar__actions">{actions}</div>}</div>;
}
