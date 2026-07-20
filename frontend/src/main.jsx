import React from "react";import ReactDOM from "react-dom/client";import App from "./App";import {APP_VERSION} from "./version";import "./styles.css";
document.title=`AlAboud Financial — ${APP_VERSION}`;
ReactDOM.createRoot(document.getElementById("root")).render(<React.StrictMode><App/></React.StrictMode>);
