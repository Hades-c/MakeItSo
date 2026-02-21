import mongoose, { Document, Model, Schema } from "mongoose";

export interface ICourse extends Document {
  code: string;          // e.g. "CS 101"
  name: string;          // e.g. "Introduction to Computer Science"
  description?: string;
  credits: number;
  department: string;
  prerequisites: string[];  // array of course codes
  offered: ("Fall" | "Spring" | "Summer")[];
  tags: string[];           // e.g. ["core", "elective", "major-requirement"]
  difficulty?: 1 | 2 | 3 | 4 | 5;
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
  },
  { timestamps: true }
);

CourseSchema.index({ code: "text", name: "text", department: "text" });

const Course: Model<ICourse> =
  mongoose.models.Course ?? mongoose.model<ICourse>("Course", CourseSchema);

export default Course;
