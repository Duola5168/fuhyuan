import React, { useRef } from 'react';

interface ImageUploaderProps {
  photos: string[];
  onPhotosChange: (photos: string[]) => void;
}

const CameraIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
);

const TrashIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

const ImageUploader: React.FC<ImageUploaderProps> = ({ photos, onPhotosChange }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const filesToProcess = Array.from(event.target.files);
      const newPhotosDataUrls: string[] = [];
      let filesRead = 0;

      if(filesToProcess.length === 0) {
        event.target.value = "";
        return;
      }

      filesToProcess.forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
          if (typeof e.target?.result === 'string') {
            newPhotosDataUrls.push(e.target.result);
          }
          filesRead++;
          if (filesRead === filesToProcess.length) {
            onPhotosChange([...photos, ...newPhotosDataUrls]);
          }
        };
        reader.readAsDataURL(file);
      });
      // Reset file input value to allow re-selecting the same file if needed
      event.target.value = "";
    }
  };

  const handleRemovePhoto = (index: number) => {
    const updatedPhotos = photos.filter((_, i) => i !== index);
    onPhotosChange(updatedPhotos);
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <div>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept="image/*"
        capture="environment"
        multiple
      />
      <button
        type="button"
        onClick={triggerFileInput}
        className="w-full flex justify-center items-center px-4 py-3 border-2 border-dashed border-slate-400 rounded-md shadow-sm text-sm font-medium text-slate-700 bg-slate-200/50 hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
      >
        <CameraIcon className="w-6 h-6 mr-2" />
        拍照或上傳圖片 ({photos.length})
      </button>

      {photos.length > 0 && (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {photos.map((photo, index) => (
            <div key={index} className="relative group">
              <img src={photo} alt={`upload-preview-${index}`} className="w-full h-auto object-cover rounded-lg shadow-md aspect-square" />
              <button
                type="button"
                onClick={() => handleRemovePhoto(index)}
                className="absolute top-1 right-1 bg-red-600/80 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Remove photo"
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ImageUploader;
