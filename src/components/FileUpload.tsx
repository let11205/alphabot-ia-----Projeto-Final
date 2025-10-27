import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Card } from "@/components/ui/card";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileUploadProps {
  onFilesUpload: (files: File[]) => void;
}

const FileUpload = ({ onFilesUpload }: FileUploadProps) => {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      onFilesUpload(acceptedFiles);
    },
    [onFilesUpload]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "text/csv": [".csv"],
      "application/vnd.ms-excel": [".xls"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
    },
  });

  return (
    <Card
      {...getRootProps()}
      className={cn(
        "p-6 border-2 border-dashed transition-all cursor-pointer",
        "bg-gradient-card backdrop-blur-xl",
        isDragActive
          ? "border-primary shadow-glow"
          : "border-border/50 hover:border-primary/50"
      )}
    >
      <input {...getInputProps()} />
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
          <Upload className="w-6 h-6 text-primary" />
        </div>
        {isDragActive ? (
          <p className="text-sm text-foreground">Solte os arquivos aqui...</p>
        ) : (
          <>
            <p className="text-sm font-medium">
              Arraste e solte planilhas aqui
            </p>
            <p className="text-xs text-muted-foreground">
              Suporta CSV, XLS, XLSX
            </p>
          </>
        )}
      </div>
    </Card>
  );
};

export default FileUpload;
