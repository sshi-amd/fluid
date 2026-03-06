import { useState } from "react";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import ContainersPage from "./pages/ContainersPage";
import ImagesPage from "./pages/ImagesPage";
import SettingsPage from "./pages/SettingsPage";
import styles from "./App.module.css";

export type Page = "containers" | "images" | "settings";

export default function App() {
  const [page, setPage] = useState<Page>("containers");

  return (
    <div className={styles.shell}>
      <Sidebar activePage={page} onNavigate={setPage} />
      <div className={styles.main}>
        <Header page={page} />
        <div className={styles.content}>
          {page === "containers" && <ContainersPage />}
          {page === "images" && <ImagesPage />}
          {page === "settings" && <SettingsPage />}
        </div>
      </div>
    </div>
  );
}
