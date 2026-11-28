-- Rollback P07 private document upload alignment.
BEGIN;

ALTER TABLE public.business_documents
  DROP CONSTRAINT IF EXISTS business_documents_storage_path_scope_check;

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
      AND (
        b.owner_id = (SELECT auth.uid())
        OR (SELECT public.is_platform_admin_only())
      )
  )
);

COMMIT;
