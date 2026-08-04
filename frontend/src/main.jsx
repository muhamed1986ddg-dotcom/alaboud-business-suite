import React from "react";import ReactDOM from "react-dom/client";import AppShell from "./AppShell";import {APP_VERSION} from "./version";import "./styles.css";import "./unified-dark.css";
document.title=`AlAboud Financial — ${APP_VERSION}`;
ReactDOM.createRoot(document.getElementById("root")).render(<React.StrictMode><AppShell/></React.StrictMode>);
