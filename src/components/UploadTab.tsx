import { useRef, useState } from 'react';
import { useStore } from '../store';
import { useT } from '../i18n';
import { AddButton } from './common';

interface Staged {
  id: string;
  name: string;
  src: string;
  aspect: number;
  caption: string;
  frame: boolean;
}

const MAX_EDGE = 3000;

/** Read an image file, downscaling very large photos, and return a data URL. */
async function readImage(file: File): Promise<{ src: string; aspect: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error(`Cannot read ${file.name}`));
      i.src = url;
    });
    const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const keepAlpha = file.type === 'image/png' || file.type === 'image/webp' || file.type === 'image/gif';
    return {
      src: keepAlpha ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.9),
      aspect: canvas.width / canvas.height,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function UploadTab() {
  const t = useT();
  const addTiles = useStore((s) => s.addTiles);
  const [staged, setStaged] = useState<Staged[]>([]);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const accept = async (files: FileList | File[]) => {
    for (const f of Array.from(files)) {
      if (!f.type.startsWith('image/')) continue;
      try {
        const { src, aspect } = await readImage(f);
        setStaged((s) => [...s, { id: Math.random().toString(36).slice(2), name: f.name, src, aspect, caption: '', frame: true }]);
      } catch (e) {
        alert((e as Error).message);
      }
    }
  };

  const patch = (id: string, p: Partial<Staged>) => setStaged((s) => s.map((x) => (x.id === id ? { ...x, ...p } : x)));

  return (
    <div className="tab">
      <div
        className={`dropzone ${drag ? 'over' : ''}`}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void accept(e.dataTransfer.files);
        }}
      >
        {t('uploadHint')}
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) void accept(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
      {staged.map((s) => (
        <div className="card upload" key={s.id}>
          <img src={s.src} alt={s.name} />
          <textarea
            rows={3}
            value={s.caption}
            placeholder={t('captionPlaceholder')}
            onChange={(e) => patch(s.id, { caption: e.target.value })}
          />
          <div className="row spread">
            <label className="check">
              <input type="checkbox" checked={s.frame} onChange={(e) => patch(s.id, { frame: e.target.checked })} /> {t('frame')}
            </label>
            <div className="row">
              <button onClick={() => setStaged((x) => x.filter((y) => y.id !== s.id))}>✕</button>
              <AddButton
                label={t('addImage')}
                onAdd={() => {
                  addTiles([
                    { type: 'image', image: { src: s.src, aspect: s.aspect }, caption: s.caption, frame: s.frame, source: { kind: 'upload', title: s.name } },
                  ]);
                  setStaged((x) => x.filter((y) => y.id !== s.id));
                }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
