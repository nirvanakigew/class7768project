import React, { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Upload, X, CheckCircle, AlertCircle, FileText, Image as ImageIcon, Video } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

interface EvidenceUploadProps {
  challengeId: number;
  onSuccess?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

type EvidenceType = 'screenshot' | 'video' | 'document' | 'text';

interface UploadedFile {
  file: File;
  type: EvidenceType;
  preview?: string;
}

export function EvidenceUpload({ 
  challengeId, 
  onSuccess, 
  open = false, 
  onOpenChange 
}: EvidenceUploadProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [isOpen, setIsOpen] = useState(open);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleOpenChange = (newOpen: boolean) => {
    setIsOpen(newOpen);
    onOpenChange?.(newOpen);
  };

  const getEvidenceType = (file: File): EvidenceType => {
    const type = file.type.toLowerCase();
    if (type.startsWith('image/')) return 'screenshot';
    if (type.startsWith('video/')) return 'video';
    if (type.startsWith('text/') || type === 'application/pdf') return 'document';
    return 'document';
  };

  const getFileIcon = (type: EvidenceType) => {
    switch (type) {
      case 'screenshot':
        return <ImageIcon className="w-5 h-5 text-blue-500" />;
      case 'video':
        return <Video className="w-5 h-5 text-purple-500" />;
      case 'document':
        return <FileText className="w-5 h-5 text-orange-500" />;
      default:
        return <FileText className="w-5 h-5 text-gray-500" />;
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    
    // Validate file count (max 5 files)
    if (uploadedFiles.length + files.length > 5) {
      toast({
        title: 'Too Many Files',
        description: 'Maximum 5 files allowed per evidence submission',
        variant: 'destructive',
      });
      return;
    }

    // Validate file sizes (max 10MB per file)
    const validFiles: UploadedFile[] = [];
    for (const file of files) {
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: 'File Too Large',
          description: `${file.name} exceeds 10MB limit`,
          variant: 'destructive',
        });
        continue;
      }

      const type = getEvidenceType(file);
      let preview: string | undefined;

      // Create preview for images
      if (type === 'screenshot') {
        preview = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.readAsDataURL(file);
        });
      }

      validFiles.push({ file, type, preview });
    }

    setUploadedFiles([...uploadedFiles, ...validFiles]);

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeFile = (index: number) => {
    setUploadedFiles(uploadedFiles.filter((_, i) => i !== index));
  };

  const uploadEvidenceMutation = useMutation({
    mutationFn: async () => {
      if (!description.trim()) {
        throw new Error('Please provide a description of the evidence');
      }

      if (uploadedFiles.length === 0) {
        throw new Error('Please select at least one file');
      }

      // Create FormData for file upload
      const formData = new FormData();
      formData.append('description', description);
      formData.append('type', 'p2p_evidence');

      uploadedFiles.forEach((item, index) => {
        formData.append(`files`, item.file);
      });

      // Upload to backend
      const response = await fetch(
        `/api/challenges/${challengeId}/evidence`,
        {
          method: 'POST',
          credentials: 'include',
          body: formData,
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to upload evidence');
      }

      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: '✅ Evidence Submitted',
        description: 'Your evidence has been submitted to admin for review',
      });
      queryClient.invalidateQueries({ queryKey: [`/api/challenges/${challengeId}`] });
      setUploadedFiles([]);
      setDescription('');
      handleOpenChange(false);
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast({
        title: '❌ Upload Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Submit Challenge Evidence
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Description Section */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Describe Your Evidence
              <span className="text-red-500 ml-1">*</span>
            </label>
            <Textarea
              placeholder="Explain what this evidence proves. Be clear and specific about how it demonstrates your claim..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="resize-none"
            />
            <p className="text-xs text-slate-500">
              Provide clear context so admins can understand your evidence
            </p>
          </div>

          {/* File Upload Section */}
          <div className="space-y-3">
            <label className="text-sm font-medium">
              Upload Files
              <span className="text-red-500 ml-1">*</span>
            </label>

            {/* Drag & Drop Area */}
            <div
              className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-6 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/20 transition"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                e.currentTarget.classList.add('border-blue-500', 'bg-blue-50');
              }}
              onDragLeave={(e) => {
                e.currentTarget.classList.remove('border-blue-500', 'bg-blue-50');
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove('border-blue-500', 'bg-blue-50');
                handleFileSelect({
                  target: { files: e.dataTransfer.files },
                } as any);
              }}
            >
              <Upload className="w-8 h-8 mx-auto mb-2 text-slate-400" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Click to upload or drag and drop
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Images, videos, documents up to 10MB each (max 5 files)
              </p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,video/*,.pdf,.txt,.doc,.docx"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          {/* Uploaded Files List */}
          {uploadedFiles.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Uploaded Files ({uploadedFiles.length}/5)
              </label>
              <div className="space-y-2">
                {uploadedFiles.map((item, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg"
                  >
                    {/* File Icon/Preview */}
                    {item.preview ? (
                      <img
                        src={item.preview}
                        alt={`preview-${index}`}
                        className="w-10 h-10 rounded object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
                        {getFileIcon(item.type)}
                      </div>
                    )}

                    {/* File Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate text-slate-900 dark:text-slate-100">
                        {item.file.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {(item.file.size / 1024 / 1024).toFixed(2)}MB • {item.type}
                      </p>
                    </div>

                    {/* Remove Button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFile(index)}
                      disabled={uploadEvidenceMutation.isPending}
                    >
                      <X className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Info Box */}
          <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900">
            <CardContent className="p-4 space-y-2">
              <div className="flex gap-2">
                <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-200">
                    Important Guidelines
                  </p>
                  <ul className="text-xs text-blue-800 dark:text-blue-300 mt-1 space-y-1 ml-2">
                    <li>✓ Submit clear, unambiguous evidence</li>
                    <li>✓ Include timestamps when possible</li>
                    <li>✓ Provide context explaining what the evidence shows</li>
                    <li>✓ Do not submit fabricated or misleading evidence</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex gap-3 justify-end pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={uploadEvidenceMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => uploadEvidenceMutation.mutate()}
              disabled={
                uploadEvidenceMutation.isPending ||
                uploadedFiles.length === 0 ||
                !description.trim()
              }
              className="gap-2"
            >
              {uploadEvidenceMutation.isPending ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                  Uploading...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  Submit Evidence
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
