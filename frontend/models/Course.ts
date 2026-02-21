import mongoose, { Document, Model, Schema } from "mongoose";

export interface ICourse extends Document {
  code: string;
  name: string;
  description?: string;
  credits: number;
  department: string;
  prerequisites: string[];
  offered: ("Fall" | "Spring" | "Summer")[];
  tags: string[];
  difficulty?: 1 | 2 | 3 | 4 | 5;
  professor?: string;
  professorRating?: number;
  careerRelevance?: { field: string; relevance: number }[];
  createdAt: Date;
  updatedAt: Date;
}

const CourseSchema = new Schema<ICourse>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String },
    credits: { type: Number, required: true, min: 0, max: 6 },
    department: { type: String, required: true, trim: true },
    prerequisites: [{ type: String }],
    offered: [{ type: String, enum: ["Fall", "Spring", "Summer"] }],
    tags: [{ type: String }],
    difficulty: { type: Number, min: 1, max: 5 },
    professor: { type: String },
    professorRating: { type: Number, min: 1, max: 5 },
    careerRelevance: [{
      field: { type: String },
      relevance: { type: Number, min: 0, max: 1 },
    }],
  },
  { timestamps: true }
);

CourseSchema.index({ code: "text", name: "text", department: "text" });
CourseSchema.index({ department: 1 });
CourseSchema.index({ "careerRelevance.field": 1 });

const Course: Model<ICourse> =
  mongoose.models.Course ?? mongoose.model<ICourse>("Course", CourseSchema);

export default Course;
