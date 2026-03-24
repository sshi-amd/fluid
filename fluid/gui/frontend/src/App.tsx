import { useState } from "react";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import ContainersPage from "./pages/ContainersPage";
import ImagesPage from "./pages/ImagesPage";
import TemplatesPage from "./pages/TemplatesPage";
import SettingsPage from "./pages/SettingsPage";
import styles from "./App.module.css";

export type Page = "containers" | "images" | "templates" | "settings";

const pages: { key: Page; Component: React.FC }[] = [
  { key: "containers", Component: ContainersPage },
  { key: "images", Component: ImagesPage },
  { key: "templates", Component: TemplatesPage },
  { key: "settings", Component: SettingsPage },
];

export default function App() {
  const [page, setPage] = useState<Page>("containers");

  return (
    <div className={styles.shell}>
      <Sidebar activePage={page} onNavigate={setPage} />
      <div className={styles.main}>
        <Header page={page} />
        <div className={styles.content}>
          {pages.map(({ key, Component }) => (
            <div
              key={key}
              className={page === key ? styles.pageActive : styles.pageHidden}
            >
              <Component />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
