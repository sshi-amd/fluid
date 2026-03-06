import type { Page } from "../App";
import styles from "./Header.module.css";

const PAGE_TITLES: Record<Page, string> = {
  containers: "Containers",
  images: "Images",
  settings: "Settings",
};

interface Props {
  page: Page;
}

export default function Header({ page }: Props) {
  return (
    <header className={styles.header}>
      <h1 className={styles.title}>{PAGE_TITLES[page]}</h1>
    </header>
  );
}
