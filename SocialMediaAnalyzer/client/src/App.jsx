import React from "react";
import { Sparkles } from "lucide-react";
import ContentAnalyzer from "./components/ContentAnalyzer.jsx";
import "../styles.css";

export default function App() {
  return (
    <div className="shell">
      <header className="top">
        <div className="brand">
          <div className="gem"><Sparkles size={18} /></div>
          <strong>SocialMediaAnalyzer</strong>
        </div>
        <div className="top-actions">
          {/* <span className="chip chip-dark"></span> */}
        </div>
      </header>

      <ContentAnalyzer />
    </div>
  );
}
