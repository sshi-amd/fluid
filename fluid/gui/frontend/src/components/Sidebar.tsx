import type { Page } from "../App";
import styles from "./Sidebar.module.css";

interface Props {
  activePage: Page;
  onNavigate: (page: Page) => void;
}

const NAV_ITEMS: { id: Page; label: string; icon: string }[] = [
  { id: "containers", label: "Containers", icon: "⬡" },
  { id: "images", label: "Images", icon: "◫" },
  { id: "settings", label: "Settings", icon: "⚙" },
];

export default function Sidebar({ activePage, onNavigate }: Props) {
  return (
    <aside className={styles.sidebar}>
      <div className={styles.logo}>
        <span className={styles.logoDot} />
        <span className={styles.logoText}>Fluid</span>
      </div>

      <nav className={styles.nav}>
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`${styles.navItem} ${activePage === item.id ? styles.active : ""}`}
            onClick={() => onNavigate(item.id)}
          >
            <span className={styles.navIcon}>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      <div className={styles.footer}>fluid-gui</div>
    </aside>
  );
}
