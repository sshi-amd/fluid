import { useState } from "react";
import { useImages, useRemoveImage, useCleanImages } from "../api/hooks";
import styles from "./ImagesPage.module.css";

export default function ImagesPage() {
  const { data: images = [], isLoading, refetch } = useImages();
  const removeImage = useRemoveImage();
  const cleanImages = useCleanImages();
  const [cleaning, setCleaning] = useState(false);
  const [error, setError] = useState("");

  async function handleClean() {
    setCleaning(true);
    await cleanImages.mutateAsync(false);
    await refetch();
    setCleaning(false);
  }

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <button
          className="btn btn-ghost"
          onClick={handleClean}
          disabled={cleaning}
        >
          {cleaning ? "Cleaning…" : "Clean unused"}
        </button>
        <button className="btn btn-ghost" onClick={() => refetch()}>
          Refresh
        </button>
      </div>

      {error && <div className={styles.error}>{error}</div>}
      {isLoading && <div className={styles.status}>Loading images…</div>}

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Tag</th>
              <th>Size</th>
              <th>Created</th>
              <th>In Use</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {images.map((img) => (
              <tr key={img.id}>
                <td className={styles.tag}>{img.tag}</td>
                <td>{img.size_mb} MB</td>
                <td>{new Date(img.created).toLocaleDateString()}</td>
                <td>
                  {img.in_use ? (
                    <span className="badge badge-running">yes</span>
                  ) : (
                    <span className="badge badge-paused">no</span>
                  )}
                </td>
                <td className={styles.actions}>
                  <button
                    className="btn btn-danger"
                    disabled={img.in_use || removeImage.isPending}
                    onClick={() => {
                      setError("");
                      removeImage.mutate({ id: img.id }, {
                        onError: (e) => setError(`Remove failed: ${e.message}`),
                      });
                    }}
                  >
                    Remove
                  </button>
                  <button
                    className="btn btn-danger"
                    disabled={removeImage.isPending}
                    onClick={() => {
                      if (confirm(`Force remove "${img.tag}"?`)) {
                        setError("");
                        removeImage.mutate({ id: img.id, force: true }, {
                          onError: (e) => setError(`Force remove failed: ${e.message}`),
                        });
                      }
                    }}
                  >
                    Force
                  </button>
                </td>
              </tr>
            ))}
            {images.length === 0 && !isLoading && (
              <tr>
                <td colSpan={5} className={styles.empty}>
                  No fluid images found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
