-- P07: align private document Storage upload with metadata ownership.
-- Preserve existing single-segment filenames while restricting new uploads to
-- the owning business folder and safe PDF/JPG/PNG object names.
BEGIN;

ALTER TABLE public.business_documents
  ADD CONSTRAINT business_documents_storage_path_scope_check
  CHECK (
    storage_path ~ (
      '^' || business_id::text ||
      '/[A-Za-z0-9_.-]{1,180}[.](pdf|jpg|png)$'
    )
  );

DROP POLICY IF EXISTS business_documents_owner_upload ON storage.objects;
CREATE POLICY business_documents_owner_upload
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'business-documents'
  AND EXISTS (
    SELECT 1
    FROM public.businesses b
    WHERE b.id::text = (storage.foldername(objects.name))[1]
      AND b.owner_id = (SELECT auth.uid())
      AND objects.name ~ (
        '^' || b.id::text ||
        '/[A-Za-z0-9_.-]{1,180}[.](pdf|jpg|png)$'
      )
  )
);

COMMIT;
