import { useState, useCallback, useRef } from "react";

export interface UploadProgressState {
  progress: number;
  uploading: boolean;
  fileName: string;
  fileSize: number;
  uploadedBytes: number;
}

export function useUploadProgress() {
  const [state, setState] = useState<UploadProgressState>({
    progress: 0,
    uploading: false,
    fileName: "",
    fileSize: 0,
    uploadedBytes: 0,
  });
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const timeoutRef = useRef<any>(null);

  const startUpload = useCallback((fileName: string, fileSize: number) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setState({ progress: 0, uploading: true, fileName, fileSize, uploadedBytes: 0 });
  }, []);

  const updateProgress = useCallback((loaded: number, total: number) => {
    const pct = total > 0 ? Math.min(Math.round((loaded / total) * 100), 100) : 0;
    setState(prev => ({ ...prev, progress: pct, uploadedBytes: loaded }));
  }, []);

  const finishUpload = useCallback(() => {
    setState(prev => ({ ...prev, progress: 100, uploading: false }));
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setState({ progress: 0, uploading: false, fileName: "", fileSize: 0, uploadedBytes: 0 });
      timeoutRef.current = null;
    }, 800);
  }, []);

  const failUpload = useCallback(() => {
    setState(prev => ({ ...prev, uploading: false }));
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setState({ progress: 0, uploading: false, fileName: "", fileSize: 0, uploadedBytes: 0 });
      timeoutRef.current = null;
    }, 1500);
  }, []);

  const cancelUpload = useCallback(() => {
    if (xhrRef.current) {
      xhrRef.current.abort();
      xhrRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setState({ progress: 0, uploading: false, fileName: "", fileSize: 0, uploadedBytes: 0 });
  }, []);

  const uploadWithProgress = useCallback(
    (url: string, formData: FormData): Promise<any> => {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhrRef.current = xhr;

        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            updateProgress(e.loaded, e.total);
          }
        });

        xhr.addEventListener("load", () => {
          xhrRef.current = null;
          if (xhr.status >= 200 && xhr.status < 300) {
            finishUpload();
            try {
              resolve(JSON.parse(xhr.responseText));
            } catch {
              resolve(xhr.responseText);
            }
          } else {
            failUpload();
            let message = `Upload failed (${xhr.status})`;
            try {
              const body = JSON.parse(xhr.responseText);
              if (body?.error) message = body.error;
            } catch {
              // non-JSON error body
            }
            reject(new Error(message));
          }
        });

        xhr.addEventListener("error", () => {
          xhrRef.current = null;
          failUpload();
          reject(new Error("Upload failed"));
        });

        xhr.addEventListener("abort", () => {
          xhrRef.current = null;
          setState({ progress: 0, uploading: false, fileName: "", fileSize: 0, uploadedBytes: 0 });
        });

        xhr.open("POST", url);
        xhr.send(formData);
      });
    },
    [updateProgress, finishUpload, failUpload]
  );

  return {
    ...state,
    startUpload,
    updateProgress,
    finishUpload,
    failUpload,
    cancelUpload,
    uploadWithProgress,
  };
}
