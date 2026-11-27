-- P07: align private document Storage upload with metadata ownership.
-- Existing private read/review/delete policies remain unchanged.
BEGIN;

ALTER TABLE public.business_documents
  ADD CONSTRAINT business_documents_storage_path_scope_check
  CHECK (
    split_part(storage_path, '/', 1) = business_id::text
    AND storage_path !~ '(^/|(^|/)\.\.?(/|$))'
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
  )
);

COMMIT;
