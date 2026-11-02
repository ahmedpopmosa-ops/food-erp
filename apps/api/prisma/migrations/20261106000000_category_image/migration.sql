-- Category picture, shown on the POS menu tiles of the category's items. Stored inline as a data URL so it
-- syncs with the catalog and works offline on the till; images are limited to ~256 KB.
ALTER TABLE categories ADD COLUMN image text;
ALTER TABLE categories ADD CONSTRAINT categories_image_check CHECK (
  image IS NULL
  OR (image ~ '^data:image/(svg\+xml|png|jpeg|webp)(;base64)?,' AND length(image) <= 350000)
);
