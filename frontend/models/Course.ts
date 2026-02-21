import mongoose, { Document, Model, Schema } from "mongoose";

export interface IProfessorInfo {
  name: string;
  title?: string;
  rmpRating?: number;
  rmpDifficulty?: number;
  rmpNumRatings?: number;
  rmpWouldTakeAgain?: number;
  rmpTags?: string[];
}

export interface ICourseInsights {
  keyTopics?: string[];
  skillsGained?: string[];
}

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
  professorInfo?: IProfessorInfo;
  courseInsights?: ICourseInsights;
  careerRelevance?: { field: string; relevance: number }[];
  createdAt: Date;
  updatedAt: Date;
}

const ProfessorInfoSchema = new Schema<IProfessorInfo>({
  name: { type: String, required: true },
  title: { type: String },
  rmpRating: { type: Number, min: 0, max: 5 },
  rmpDifficulty: { type: Number, min: 0, max: 5 },
  rmpNumRatings: { type: Number, min: 0 },
  rmpWouldTakeAgain: { type: Number, min: 0, max: 100 },
  rmpTags: [{ type: String }],
}, { _id: false });

const CourseInsightsSchema = new Schema<ICourseInsights>({
  keyTopics: [{ type: String }],
  skillsGained: [{ type: String }],
}, { _id: false });

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
    professorInfo: { type: ProfessorInfoSchema },
    courseInsights: { type: CourseInsightsSchema },
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
