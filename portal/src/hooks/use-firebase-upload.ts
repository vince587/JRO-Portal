import { useState, useCallback } from "react";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase";

export function useFirebaseUpload() {
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState(0);

  const upload = useCallback(
    (file: File, path: string): Promise<string> => {
      return new Promise((resolve, reject) => {
        if (!storage) {
          reject(new Error("Firebase storage not configured"));
          return;
        }

        setUploading(true);
        setFileName(file.name);
        setFileSize(file.size);
        setProgress(0);

        const storageRef = ref(storage, path);
        const task = uploadBytesResumable(storageRef, file);

        task.on(
          "state_changed",
          (snapshot) => {
            const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
            setProgress(pct);
          },
          (error) => {
            setUploading(false);
            setProgress(0);
            reject(error);
          },
          async () => {
            const url = await getDownloadURL(task.snapshot.ref);
            setProgress(100);
            setTimeout(() => {
              setUploading(false);
              setProgress(0);
            }, 800);
            resolve(url);
          }
        );
      });
    },
    []
  );

  return { progress, uploading, fileName, fileSize, upload };
}
