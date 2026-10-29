CREATE OR REPLACE FUNCTION notify_round_algorithms() RETURNS TRIGGER AS $$
BEGIN
	PERFORM pg_notify(
		'round_algorithms_change',
		json_build_object(
			'round_id', NEW.round_id::text,
			'algorithm', NEW.algorithm::text
		)::text
	);
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER round_algorithms_notify_insert
AFTER INSERT ON round_algorithms
FOR EACH ROW
EXECUTE FUNCTION notify_round_algorithms();

CREATE TRIGGER round_algorithms_notify_update
AFTER UPDATE ON round_algorithms
FOR EACH ROW
EXECUTE FUNCTION notify_round_algorithms();
