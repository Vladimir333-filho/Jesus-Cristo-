-- P07: align private document Storage upload with metadata ownership.
-- Existing private read/review/delete policies remain unchanged.
BEGIN;

ALTER TABLE public.business_documents
  ADD CONSTRAINT business_documents_storage_path_scope_check
  CHECK (
    storage_path ~ ('^' || business_id::text || '/[0-9]+_[A-Za-z0-9_-]{1,100}[.](pdf|jpg|png)
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
  )
);

COMMIT;
