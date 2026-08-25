CREATE TRIGGER immutable_learning_checkpoints_delete
BEFORE DELETE ON learning_checkpoints
BEGIN
  SELECT RAISE(ABORT, 'immutable_learning_checkpoint');
END;
