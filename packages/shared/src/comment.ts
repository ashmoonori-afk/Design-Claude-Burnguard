export interface Comment {
  id: string;
  project_id: string;
  rel_path: string;
  node_selector: string;
  x_pct: number;
  y_pct: number;
  slide_index: number | null;
  body: string;
  author_id: string;
  resolved_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface CreateCommentRequest {
  rel_path: string;
  node_selector?: string;
  x_pct: number;
  y_pct: number;
  slide_index?: number | null;
  body?: string;
}

export interface UpdateCommentRequest {
  body?: string;
  resolved?: boolean;
}
