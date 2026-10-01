-- Garmin may write a day before the first position of that day arrives.
alter table days alter column km_start drop not null;
alter table days alter column km_end drop not null;
