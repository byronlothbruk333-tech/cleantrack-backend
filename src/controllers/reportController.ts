import { Request, Response } from 'express';
import Report, { IssueType, ReportStatus, Priority } from '../models/Report';
import User from '../models/User';
import { AuthRequest } from '../middleware/auth';
import ReportComment from '../models/ReportComment';

// ============================================
// CREATE REPORT
// POST /api/reports
// Requires: authenticate (citizen)
// ============================================
export const createReport = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const {
      issueType,
      description,
      address,
      latitude,
      longitude,
      photos,
      contactName,
      contactPhone,
      contactEmail,
    } = req.body;

    // Validate required fields
    if (!issueType || !description || !address) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'issueType, description, and address are required',
      });
    }

    // Validate issue type
    const allowedIssueTypes = Object.values(IssueType);
    if (!allowedIssueTypes.includes(issueType)) {
      return res.status(400).json({
        error: 'Invalid issue type',
        message: `issueType must be one of: ${allowedIssueTypes.join(', ')}`,
      });
    }

    // Auto-set priority based on issue type
    let priority: Priority = Priority.MEDIUM;
    if (issueType === IssueType.ILLEGAL_DUMPING) {
      priority = Priority.HIGH;
    } else if (issueType === IssueType.OVERFLOWING_BIN) {
      priority = Priority.MEDIUM;
    } else if (issueType === IssueType.MISSED_COLLECTION) {
      priority = Priority.MEDIUM;
    }

    // Create the report
    const report = await Report.create({
      citizenId: req.user.id,
      issueType,
      description,
      address,
      latitude: latitude || null,
      longitude: longitude || null,
      photos: photos || [],
      status: ReportStatus.PENDING,
      priority,
      contactName: contactName || null,
      contactPhone: contactPhone || null,
      contactEmail: contactEmail || null,
    });

    res.status(201).json({
      message: 'Report submitted successfully',
      report,
    });
  } catch (error: any) {
    console.error('Create report error:', error);
    res.status(500).json({
      error: 'Failed to create report',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    });
  }
};

// ============================================
// GET MY REPORTS
// GET /api/reports/my
// Requires: authenticate (citizen)
// ============================================
export const getMyReports = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const reports = await Report.findAll({
      where: { citizenId: req.user.id },
      order: [['createdAt', 'DESC']],
    });

    res.json({
      count: reports.length,
      reports,
    });
  } catch (error: any) {
    console.error('Get my reports error:', error);
    res.status(500).json({
      error: 'Failed to fetch reports',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    });
  }
};

// ============================================
// GET ALL REPORTS
// GET /api/reports
// Requires: authenticate + authorize(admin, management)
// ============================================
export const getAllReports = async (req: AuthRequest, res: Response) => {
  try {
    const {
      status,
      priority,
      issueType,
      limit = '50',
      offset = '0',
    } = req.query;

    // Build filter
    const where: any = {};
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (issueType) where.issueType = issueType;

    const { count, rows: reports } = await Report.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: 'citizen',
          attributes: ['id', 'name', 'email', 'phone'],
        },
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });

    res.json({
      total: count,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
      reports,
    });
  } catch (error: any) {
    console.error('Get all reports error:', error);
    res.status(500).json({
      error: 'Failed to fetch reports',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    });
  }
};

// ============================================
// GET REPORT BY ID
// GET /api/reports/:id
// Requires: authenticate
// - Citizens can only see their own reports
// - Admins can see any report
// ============================================
export const getReportById = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const report = await Report.findByPk(req.params.id, {
      include: [
        {
          model: User,
          as: 'citizen',
          attributes: ['id', 'name', 'email', 'phone'],
        },
      ],
    });

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    // Citizens can only view their own reports
    if (
      req.user.role === 'citizen' &&
      report.citizenId !== req.user.id
    ) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only view your own reports',
      });
    }

    res.json({ report });
  } catch (error: any) {
    console.error('Get report by id error:', error);
    res.status(500).json({
      error: 'Failed to fetch report',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    });
  }
};

// ============================================
// UPDATE REPORT STATUS
// PATCH /api/reports/:id/status
// Requires: authenticate + authorize(admin, management)
// ============================================
export const updateReportStatus = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { status, assignedTo } = req.body;

    if (!status) {
      return res.status(400).json({
        error: 'Missing status',
        message: 'status is required',
      });
    }

    const allowedStatuses = Object.values(ReportStatus);
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        error: 'Invalid status',
        message: `status must be one of: ${allowedStatuses.join(', ')}`,
      });
    }

    const report = await Report.findByPk(req.params.id);
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    // Update fields
    report.status = status;
    if (assignedTo !== undefined) {
      report.assignedTo = assignedTo || null;
    }
    if (status === ReportStatus.RESOLVED) {
      report.resolvedAt = new Date();
    }

    await report.save();

    res.json({
      message: 'Report status updated successfully',
      report,
    });
  } catch (error: any) {
    console.error('Update report status error:', error);
    res.status(500).json({
      error: 'Failed to update report',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    });
  }
};

// ============================================
// UPDATE REPORT
// PUT /api/reports/:id
// Requires: authenticate
// - Citizens can update their own PENDING reports
// - Admins can update any report
// ============================================
export const updateReport = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const report = await Report.findByPk(req.params.id);
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    // Permission check
    const isOwner = report.citizenId === req.user.id;
    const isAdmin =
      req.user.role === 'admin' || req.user.role === 'management';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only update your own reports',
      });
    }

    // Citizens can only update pending reports
    if (isOwner && !isAdmin && report.status !== ReportStatus.PENDING) {
      return res.status(403).json({
        error: 'Cannot update',
        message: 'You can only update reports that are still pending',
      });
    }

    // Only allow updating certain fields
    const { description, address, latitude, longitude, photos, issueType } = req.body;

    if (description !== undefined) report.description = description;
    if (address !== undefined) report.address = address;
    if (latitude !== undefined) report.latitude = latitude;
    if (longitude !== undefined) report.longitude = longitude;
    if (photos !== undefined) report.photos = photos;
    if (issueType !== undefined) report.issueType = issueType;

    await report.save();

    res.json({
      message: 'Report updated successfully',
      report,
    });
  } catch (error: any) {
    console.error('Update report error:', error);
    res.status(500).json({
      error: 'Failed to update report',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    });
  }
};

// ============================================
// DELETE REPORT
// DELETE /api/reports/:id
// Requires: authenticate
// - Citizens can delete their own PENDING reports
// - Admins can delete any report
// ============================================
export const deleteReport = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const report = await Report.findByPk(req.params.id);
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const isOwner = report.citizenId === req.user.id;
    const isAdmin =
      req.user.role === 'admin' || req.user.role === 'management';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only delete your own reports',
      });
    }

    // Citizens can only delete pending reports
    if (isOwner && !isAdmin && report.status !== ReportStatus.PENDING) {
      return res.status(403).json({
        error: 'Cannot delete',
        message: 'You can only delete reports that are still pending',
      });
    }

    await report.destroy();

    res.json({
      message: 'Report deleted successfully',
    });
  } catch (error: any) {
    console.error('Delete report error:', error);
    res.status(500).json({
      error: 'Failed to delete report',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    });
  }
};

// ============================================
// GET REPORT STATS (for citizen dashboard)
// GET /api/reports/stats
// Requires: authenticate (citizen)
// ============================================
export const getReportStats = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const reports = await Report.findAll({
      where: { citizenId: req.user.id },
      attributes: ['status'],
    });

    const stats = {
      total: reports.length,
      pending: reports.filter((r) => r.status === ReportStatus.PENDING).length,
      inProgress: reports.filter((r) => r.status === ReportStatus.IN_PROGRESS).length,
      resolved: reports.filter((r) => r.status === ReportStatus.RESOLVED).length,
      rejected: reports.filter((r) => r.status === ReportStatus.REJECTED).length,
    };

    res.json({ stats });
  } catch (error: any) {
    console.error('Get report stats error:', error);
    res.status(500).json({
      error: 'Failed to fetch stats',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    });
  }
};
// ============================================
// GET REPORT COUNTS BY STATUS
// GET /api/reports/counts
// Requires: authenticate + authorize(admin, management)
// ============================================
export const getReportCounts = async (req: AuthRequest, res: Response) => {
  try {
    const reports = await Report.findAll({
      attributes: ['status'],
    });

    const counts = {
      total: reports.length,
      pending: reports.filter((r) => r.status === ReportStatus.PENDING).length,
      inProgress: reports.filter((r) => r.status === ReportStatus.IN_PROGRESS).length,
      resolved: reports.filter((r) => r.status === ReportStatus.RESOLVED).length,
      rejected: reports.filter((r) => r.status === ReportStatus.REJECTED).length,
    };

    res.json({ counts });
  } catch (error: any) {
    console.error('Get report counts error:', error);
    res.status(500).json({
      error: 'Failed to fetch counts',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    });
  }
};

// ============================================
// GET REPORTS BY CITIZEN
// GET /api/reports/by-citizen/:citizenId
// Requires: authenticate + authorize(admin, management)
// ============================================
export const getReportsByCitizen = async (req: AuthRequest, res: Response) => {
  try {
    const { citizenId } = req.params;

    // Verify the citizen exists
    const citizen = await User.findByPk(citizenId, {
      attributes: ['id', 'name', 'email', 'phone'],
    });

    if (!citizen) {
      return res.status(404).json({ error: 'Citizen not found' });
    }

    const reports = await Report.findAll({
      where: { citizenId },
      order: [['createdAt', 'DESC']],
    });

    res.json({
      citizen,
      count: reports.length,
      reports,
    });
  } catch (error: any) {
    console.error('Get reports by citizen error:', error);
    res.status(500).json({
      error: 'Failed to fetch reports',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    });
  }
};

// ============================================
// GET COMMENTS ON A REPORT
// GET /api/reports/:id/comments
// Requires: authenticate
// - Citizens see only public comments on their own reports
// - Admins/drivers see all comments
// ============================================
export const getReportComments = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const report = await Report.findByPk(req.params.id);
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const isAdmin =
      req.user.role === 'admin' || req.user.role === 'management';
    const isDriver = req.user.role === 'driver';
    const isOwner = report.citizenId === req.user.id;

    // Citizens can only view their own reports
    if (req.user.role === 'citizen' && !isOwner) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only view comments on your own reports',
      });
    }

    // Build filter — citizens only see public comments
    const where: any = { reportId: req.params.id };
    if (req.user.role === 'citizen') {
      where.isInternal = false;
    }

    const comments = await ReportComment.findAll({
      where,
      include: [
        {
          model: User,
          as: 'author',
          attributes: ['id', 'name', 'email', 'role'],
        },
      ],
      order: [['createdAt', 'ASC']],
    });

    res.json({
      count: comments.length,
      comments,
    });
  } catch (error: any) {
    console.error('Get report comments error:', error);
    res.status(500).json({
      error: 'Failed to fetch comments',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    });
  }
};

// ============================================
// ADD A COMMENT TO A REPORT
// POST /api/reports/:id/comments
// Requires: authenticate
// - Citizens can comment on their own reports (public only)
// - Admins/drivers can add public or internal comments
// ============================================
export const addReportComment = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { content, isInternal } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({
        error: 'Missing content',
        message: 'Comment content is required',
      });
    }

    const report = await Report.findByPk(req.params.id);
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const isAdmin =
      req.user.role === 'admin' || req.user.role === 'management';
    const isDriver = req.user.role === 'driver';
    const isOwner = report.citizenId === req.user.id;

    // Citizens can only comment on their own reports
    if (req.user.role === 'citizen' && !isOwner) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only comment on your own reports',
      });
    }

    // Citizens cannot create internal comments
    const allowInternal = isAdmin || isDriver;
    const commentIsInternal = allowInternal && isInternal === true;

    const comment = await ReportComment.create({
      reportId: req.params.id,
      userId: req.user.id,
      content: content.trim(),
      isInternal: commentIsInternal,
    });

    // Reload with author info
    const commentWithAuthor = await ReportComment.findByPk(comment.id, {
      include: [
        {
          model: User,
          as: 'author',
          attributes: ['id', 'name', 'email', 'role'],
        },
      ],
    });

    res.status(201).json({
      message: 'Comment added successfully',
      comment: commentWithAuthor,
    });
  } catch (error: any) {
    console.error('Add report comment error:', error);
    res.status(500).json({
      error: 'Failed to add comment',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    });
  }
};

// ============================================
// DELETE A COMMENT
// DELETE /api/reports/:id/comments/:commentId
// Requires: authenticate
// - Only the author can delete their own comment
// - Admins can delete any comment
// ============================================
export const deleteReportComment = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const comment = await ReportComment.findByPk(req.params.commentId);
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    const isAdmin =
      req.user.role === 'admin' || req.user.role === 'management';
    const isAuthor = comment.userId === req.user.id;

    if (!isAuthor && !isAdmin) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only delete your own comments',
      });
    }

    await comment.destroy();

    res.json({ message: 'Comment deleted successfully' });
  } catch (error: any) {
    console.error('Delete report comment error:', error);
    res.status(500).json({
      error: 'Failed to delete comment',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    });
  }
};