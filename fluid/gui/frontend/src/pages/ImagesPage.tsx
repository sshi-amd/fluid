import React, { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/shared/Button';
import { getImages, removeImage, cleanImages as cleanImagesApi } from '../api/api';
import type { ImageInfo } from '../types';
import styles from './ImagesPage.module.css';

export function ImagesPage() {
  const [images, setImages] = useState<ImageInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const imgs = await getImages();
    setImages(imgs);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleRemove(img: ImageInfo) {
    if (!confirm(`Remove image ${img.tag}?`)) return;
    setRemovingId(img.id);
    await removeImage(img.id);
    await load();
    setRemovingId(null);
  }

  async function handleClean(force: boolean) {
    if (force && !confirm('Force remove ALL Fluid images? This cannot be undone.')) return;
    await cleanImagesApi(force);
    await load();
  }

  const subtitle = loading ? 'Loading…' : `${images.length} image${images.length !== 1 ? 's' : ''}`;

  return (
    <div className={styles.page}>
      <PageHeader
        title="Images"
        subtitle={subtitle}
        actions={
          <>
            <Button variant="secondary" onClick={load}>Refresh</Button>
            <Button variant="secondary" onClick={() => handleClean(false)}>Clean Unused</Button>
            <Button variant="danger" onClick={() => handleClean(true)}>Force Clean All</Button>
          </>
        }
      />
      <div className={styles.content}>
        {!loading && images.length === 0 ? (
          <div className={styles.empty}>No Fluid images found.</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Image</th>
                <th>ROCm</th>
                <th>Size</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {images.map((img) => (
                <tr key={img.id}>
                  <td className={styles.tag}>{img.tag}</td>
                  <td>{img.rocm_version}</td>
                  <td className={styles.size}>{img.size_mb.toFixed(0)} MB</td>
                  <td>
                    <span className={[styles.status, img.in_use ? styles.inUse : styles.unused].join(' ')}>
                      <span className={styles.statusDot} />
                      {img.in_use ? 'In use' : 'Unused'}
                    </span>
                  </td>
                  <td>
                    <button
                      className={styles.removeBtn}
                      onClick={() => handleRemove(img)}
                      disabled={removingId === img.id}
                    >
                      {removingId === img.id ? 'Removing…' : 'Remove'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
