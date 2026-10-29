CREATE OR REPLACE FUNCTION notify_outbox_insert() RETURNS TRIGGER AS $$
BEGIN
	PERFORM pg_notify(
		'outbox_insert',
		json_build_object('outbox_id', NEW.id::text)::text
	);
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER outbox_notify_insert
AFTER INSERT ON outbox
FOR EACH ROW
EXECUTE FUNCTION notify_outbox_insert();
